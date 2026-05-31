import { createKravaClient, createKravaPlatformClient } from "@kravalabs/api-client";
import { loadEnv } from "./env.js";
import { getState, searchLocalMemory } from "./store.js";

const externalUserId = "papertrail-demo-user";

// Cache the Krava user token in-process so we don't re-run users.getOrCreate on
// every request — that endpoint is rate-limited and the throttling was forcing
// the Q&A path to fall back to local answers under burst load.
let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 5 * 60 * 1000;

async function getUserToken() {
  loadEnv();
  if (!process.env.KRAVA_APP_KEY) return null;
  if (cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) return cachedToken;
  const platform = createKravaPlatformClient({ appKey: process.env.KRAVA_APP_KEY });
  const user = await platform.users.getOrCreate(externalUserId);
  cachedToken = user.userToken;
  cachedTokenAt = Date.now();
  return cachedToken;
}

function parseSseText(streamText) {
  return streamText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6).trim())
    .filter((line) => line && line !== "[DONE]")
    .map((line) => {
      try {
        return JSON.parse(line).text || "";
      } catch {
        return "";
      }
    })
    .join("")
    .trim();
}

// Retry on rate limits / transient 5xx so bursty upload flows
// firing several extractions, then a question) still resolve through Krava
// instead of dropping to the local fallback.
async function kravaFetch(url, options, { retries = 3, baseDelay = 1500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        const retryAfter = parseFloat(response.headers.get("retry-after") || "0");
        const delay = retryAfter ? retryAfter * 1000 : baseDelay * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * (attempt + 1)));
    }
  }
  throw lastError || new Error("Krava request failed");
}

async function kravaPlatformChat(message, system) {
  const userToken = await getUserToken();
  if (!userToken) throw new Error("KRAVA_APP_KEY is missing.");

  const response = await kravaFetch("https://krava.io/api/platform/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-privy-token": userToken,
    },
    body: JSON.stringify({
      message: message.slice(0, 2950),
      system,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Krava platform chat failed with ${response.status}: ${text.slice(0, 200)}`);
  }

  return parseSseText(await response.text());
}

function parseJson(text) {
  const clean = text.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Krava did not return parseable JSON.");
    return JSON.parse(match[0]);
  }
}

const asArray = (value) => (Array.isArray(value) ? value : []);

// Extraction is performed entirely by Krava. PaperTrail does not read or parse
// the document content itself — it only sends the text to Krava and formats
// whatever structured JSON Krava returns. If Krava is unavailable we surface an
// error rather than inventing data.
export async function extractDocumentWithKrava(input, documentText) {
  const base = {
    documentId: input.id || crypto.randomUUID(),
    documentName: input.name || "Uploaded document",
  };

  const system =
    "You are PaperTrail's Krava-native private reasoning engine. Extract life-admin structure and classify sensitive facts. Return only valid compact JSON. Do not include markdown.";
  const message = `Document name: ${base.documentName}

Document text:
${(documentText || "").slice(0, 2350)}

Return JSON with exactly these keys:
documentName string, documentType string, summary string,
facts array of {label,value,category,sensitivity},
deadlines array of {title,date,urgency,nextStep},
subscriptions array of {merchant,amount,cadence,category,cancelSuggestion},
payments array of {label,amount,dueDate,payee},
contacts array of {name,role,contact},
actionItems array of {title,priority,dueDate,suggestedAction},
keyDetails array of {label,value,category},
questionsAnsweredByThisDoc array of strings,
kravaRole string explaining that Krava performed extraction/classification/reasoning.`;

  const answer = await kravaPlatformChat(message, system);
  const extraction = parseJson(answer);
  return {
    extraction: {
      documentId: base.documentId,
      documentName: base.documentName,
      documentType: extraction.documentType || "document",
      summary: extraction.summary || "",
      facts: asArray(extraction.facts),
      deadlines: asArray(extraction.deadlines),
      subscriptions: asArray(extraction.subscriptions),
      payments: asArray(extraction.payments),
      contacts: asArray(extraction.contacts),
      actionItems: asArray(extraction.actionItems),
      keyDetails: asArray(extraction.keyDetails || extraction.sensitiveFields),
      questionsAnsweredByThisDoc: asArray(extraction.questionsAnsweredByThisDoc),
      kravaRole:
        extraction.kravaRole ||
        "Krava Platform Chat read the document, extracted the structure, and classified sensitive facts.",
    },
    provider: "krava-platform-chat",
  };
}

export async function getKravaSession() {
  try {
    const userToken = await getUserToken();
    return userToken
      ? { connected: true, mode: "live", externalUserId }
      : { connected: false, mode: "demo", externalUserId, message: "KRAVA_APP_KEY is missing." };
  } catch (error) {
    return { connected: false, mode: "fallback", externalUserId, message: error.message };
  }
}

export async function savePaperTrailMemories(extraction) {
  const userToken = await getUserToken().catch(() => null);
  if (!userToken) return { connected: false, saved: 0, mode: "demo" };

  const client = createKravaClient({ getToken: () => userToken });
  const memories = [
    { contentType: "source_summary", content: JSON.stringify({ document: extraction.documentName, summary: extraction.summary }) },
    ...(extraction.facts || []).map((fact) => ({ contentType: "document_fact", content: JSON.stringify({ document: extraction.documentName, ...fact }) })),
    ...(extraction.deadlines || []).map((deadline) => ({ contentType: "deadline", content: JSON.stringify({ document: extraction.documentName, ...deadline }) })),
    ...(extraction.subscriptions || []).map((subscription) => ({ contentType: "subscription", content: JSON.stringify({ document: extraction.documentName, ...subscription }) })),
  ];

  let saved = 0;
  for (const memory of memories) {
    try {
      const result = await client.memory.save(memory.content, memory.contentType);
      if (result.success && !result.skipped) saved += 1;
    } catch {
      return { connected: false, saved, mode: "fallback", message: "Krava memory save was unavailable; local fallback is active." };
    }
  }

  return { connected: true, saved, mode: "live" };
}

// Send Krava only the raw extracted document info (name + the summary Krava
// produced when reading the file) — no structured facts/deadlines arrays.
function buildAskContext(state) {
  return {
    documentCount: state.documents.length,
    documents: state.documents.slice(0, 10).map((doc) => ({
      name: doc.name,
      type: doc.documentType,
      info: doc.summary || "",
    })),
  };
}

export async function askPaperTrail(query, clientState = null) {
  const { sessionState } = await import("./store.js");
  const state = sessionState(clientState);
  const memories = searchLocalMemory(query, state);
  const sources = [...new Set(memories.map((item) => item.sourceDocument).filter(Boolean))];
  const context = buildAskContext(state);

  if (!state.documents.length) {
    return {
      answer:
        "I do not have any documents yet. Upload or paste a document, wait for extraction to finish (check the inbox), then ask again in this session.",
      provider: "papertrail",
      sources: [],
      privateFactsAccessed: [],
      documentCount: 0,
      hint: "no_documents",
    };
  }

  const docNames = state.documents.map((d) => d.name);
  const userToken = await getUserToken().catch(() => null);

  if (!userToken) {
    return {
      answer: "I couldn't reach Krava right now, so I can't answer this. Please try again in a moment.",
      provider: "unavailable",
      sources: sources.length ? sources : docNames,
      privateFactsAccessed: [],
      documentCount: state.documents.length,
      warning: "Krava is not reachable (missing token).",
    };
  }

  try {
    const compactContext = JSON.stringify(context).slice(0, 2500);
    const response = await kravaFetch("https://krava.io/api/platform/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-privy-token": userToken,
      },
      body: JSON.stringify({
        message: `Question: ${query}\n\nMy documents:\n${compactContext}`,
        system:
          "You are PaperTrail, a private life-admin assistant. Answer using ONLY the document information provided. Be brief and direct: 1-2 short sentences, or up to 3 short bullet points for lists. Lead with the answer. Do not repeat the question, do not add preamble, disclaimers, or markdown headings. If the answer is not in the documents, say so in one sentence. Never invent facts.",
      }),
    });

    if (!response.ok) {
      throw new Error(`Krava platform chat failed with ${response.status}`);
    }

    const answer = parseSseText(await response.text());

    if (answer) {
      return {
        answer,
        provider: "krava-platform-chat",
        sources: sources.length ? sources : docNames,
        privateFactsAccessed: [],
        documentCount: state.documents.length,
      };
    }
    throw new Error("Krava returned an empty answer.");
  } catch (platformError) {
    // Try the lower-level agent API before giving up — still Krava, no fabrication.
    try {
      const client = createKravaClient({ getToken: () => userToken });
      const { gatewayToken } = await client.agent.getGatewayCredentials();
      const response = await client.v1.agentChat(
        {
        model: "claude-haiku-4-5-20251001",
        stream: false,
        system: "You are PaperTrail, a private life-admin assistant. Answer using ONLY the document information provided. Be brief and direct: 1-2 short sentences, or up to 3 short bullet points. Lead with the answer, no preamble or markdown headings. If not in the documents, say so in one sentence. Never invent facts.",
          messages: [
            {
              role: "user",
              content: `Question: ${query}\n\nMy documents:\n${JSON.stringify(context).slice(0, 2500)}`,
            },
          ],
        },
        { gatewayToken },
      );
      const body = await response.json();
      const answer = body?.content?.[0]?.text || body?.text || body?.message;
      if (!answer) throw new Error("Krava agent returned an empty answer.");
      return {
        answer,
        provider: "krava",
        sources: sources.length ? sources : docNames,
        privateFactsAccessed: [],
        documentCount: state.documents.length,
      };
    } catch (agentError) {
      return {
        answer: "I couldn't reach Krava to answer this question. Please try again in a moment.",
        provider: "unavailable",
        warning: agentError?.message || platformError?.message,
        sources: sources.length ? sources : docNames,
        privateFactsAccessed: [],
        documentCount: state.documents.length,
      };
    }
  }
}
