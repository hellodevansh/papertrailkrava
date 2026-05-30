import { createKravaClient, createKravaPlatformClient } from "@kravalabs/api-client";
import { loadEnv } from "./env.js";
import { getState, searchLocalMemory } from "./store.js";

const externalUserId = "papertrail-demo-user";

async function getUserToken() {
  loadEnv();
  if (!process.env.KRAVA_APP_KEY) return null;
  const platform = createKravaPlatformClient({ appKey: process.env.KRAVA_APP_KEY });
  const user = await platform.users.getOrCreate(externalUserId);
  return user.userToken;
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

async function kravaPlatformChat(message, system) {
  const userToken = await getUserToken();
  if (!userToken) throw new Error("KRAVA_APP_KEY is missing.");

  const response = await fetch("https://krava.io/api/platform/chat", {
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

function localExtract(input, documentText = "") {
  const text = documentText || input.text || "";
  const lower = text.toLowerCase();
  const documentName = input.name || "Uploaded document";

  if (lower.includes("netflix") || lower.includes("spotify")) {
    return {
      documentName,
      documentType: "credit_card_statement",
      summary: "Credit card statement with monthly recurring subscriptions and a payment deadline.",
      facts: [
        { label: "Card ending", value: "4421", category: "financial", sensitivity: "high" },
        { label: "Statement period", value: "May 1 - May 28, 2026", category: "financial", sensitivity: "medium" },
      ],
      deadlines: [{ title: "Credit card payment due", date: "2026-06-12", urgency: "high", nextStep: "Pay at least the minimum payment." }],
      subscriptions: [
        { merchant: "Netflix", amount: "$15.49", cadence: "monthly", category: "streaming", cancelSuggestion: "Review usage before renewing." },
        { merchant: "Spotify", amount: "$11.99", cadence: "monthly", category: "music", cancelSuggestion: "Keep if actively used." },
        { merchant: "iCloud", amount: "$2.99", cadence: "monthly", category: "storage", cancelSuggestion: "Low-cost utility subscription." },
        { merchant: "Gympass", amount: "$39.00", cadence: "monthly", category: "fitness", cancelSuggestion: "Highest recurring charge; review usage." },
        { merchant: "Notion", amount: "$10.00", cadence: "monthly", category: "productivity", cancelSuggestion: "Cancel if no active workspace need." },
      ],
      payments: [{ label: "Minimum payment", amount: "$85.00", dueDate: "2026-06-12", payee: "Credit card issuer" }],
      contacts: [],
      actionItems: [{ title: "Review subscriptions over $20", priority: "medium", dueDate: "2026-06-12", suggestedAction: "Consider cancelling Gympass if unused." }],
      sensitiveFields: [{ label: "Card ending", value: "4421", category: "financial", reason: "Payment instrument identifier" }],
      questionsAnsweredByThisDoc: ["What subscriptions am I paying for?", "What bills are due this week?"],
      kravaRole: "local fallback used because Krava extraction was unavailable.",
    };
  }

  if (lower.includes("claim") || lower.includes("appeal")) {
    return {
      documentName,
      documentType: "insurance_denial",
      summary: "Insurance denial letter requiring missing documentation before an appeal deadline.",
      facts: [
        { label: "Claim ID", value: "INS-48291-A", category: "insurance", sensitivity: "high" },
        { label: "Missing documents", value: "referral letter, itemized receipt, provider NPI, visit dates", category: "health", sensitivity: "high" },
      ],
      deadlines: [{ title: "Insurance appeal deadline", date: "2026-06-14", urgency: "high", nextStep: "Collect missing documentation and submit appeal." }],
      subscriptions: [],
      payments: [],
      contacts: [],
      actionItems: [{ title: "Prepare insurance appeal packet", priority: "high", dueDate: "2026-06-14", suggestedAction: "Gather referral, receipt, NPI, and visit dates." }],
      sensitiveFields: [
        { label: "Claim ID", value: "INS-48291-A", category: "insurance", reason: "Claim identifier" },
        { label: "Treatment type", value: "physical therapy", category: "health", reason: "Health-related service" },
      ],
      questionsAnsweredByThisDoc: ["What insurance claim is missing documents?", "What is urgent this week?"],
      kravaRole: "local fallback used because Krava extraction was unavailable.",
    };
  }

  return {
    documentName,
    documentType: "lease_notice",
    summary: "Lease renewal notice with a rent increase and response deadline.",
    facts: [
      { label: "Address", value: "995 Market Street, Unit 1502", category: "housing", sensitivity: "high" },
      { label: "Current rent", value: "$2,850", category: "financial", sensitivity: "high" },
      { label: "New rent", value: "$3,100", category: "financial", sensitivity: "high" },
      { label: "Lease expiration", value: "June 30, 2027", category: "housing", sensitivity: "medium" },
    ],
    deadlines: [{ title: "Respond to lease notice", date: "2026-06-07", urgency: "high", nextStep: "Request payment plan or accommodation before deadline." }],
    subscriptions: [],
    payments: [{ label: "New monthly rent", amount: "$3,100", dueDate: "2026-07-01", payee: "Frontier Property Management" }],
    contacts: [{ name: "Frontier Property Management", role: "Landlord", contact: "leasing@example.com" }],
    actionItems: [{ title: "Draft landlord reply", priority: "high", dueDate: "2026-06-07", suggestedAction: "Ask for a payment plan while withholding personal reasons unless approved." }],
    sensitiveFields: [
      { label: "Address", value: "995 Market Street, Unit 1502", category: "housing", reason: "Home address" },
      { label: "Rent amount", value: "$2,850 -> $3,100", category: "financial", reason: "Financial obligation" },
      { label: "Accommodation reason", value: "Personal reason for request", category: "personal", reason: "Could reveal private circumstances" },
    ],
    questionsAnsweredByThisDoc: ["When does my lease expire?", "When is my lease changing?", "Did my rent increase?"],
    kravaRole: "local fallback used because Krava extraction was unavailable.",
  };
}

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
sensitiveFields array of {label,value,category,reason},
questionsAnsweredByThisDoc array of strings,
kravaRole string explaining that Krava performed extraction/classification/reasoning.`;

  try {
    const answer = await kravaPlatformChat(message, system);
    const extraction = parseJson(answer);
    return {
      extraction: {
        ...localExtract(input, documentText),
        ...extraction,
        documentId: base.documentId,
        documentName: base.documentName,
        kravaRole: extraction.kravaRole || "Krava Platform Chat extracted tasks, classified sensitive facts, and produced consent-aware structure.",
      },
      provider: "krava-platform-chat",
    };
  } catch (error) {
    return {
      extraction: {
        ...localExtract(input, documentText),
        documentId: base.documentId,
        documentName: base.documentName,
      },
      provider: "local-fallback",
      warning: error instanceof Error ? error.message : "Krava extraction failed",
    };
  }
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

function localAnswer(query) {
  const state = getState();
  const q = query.toLowerCase();
  const accessed = [];

  if (q.includes("subscription")) {
    accessed.push(...state.subscriptions.map((item) => `${item.merchant} ${item.amount}`));
    return {
      answer: state.subscriptions.length
        ? `I found ${state.subscriptions.length} recurring subscriptions: ${state.subscriptions.map((item) => `${item.merchant} (${item.amount}/${item.cadence})`).join(", ")}. The highest-cost cancellation candidate is ${state.subscriptions.sort((a, b) => parseFloat((b.amount || "0").replace(/[^0-9.]/g, "")) - parseFloat((a.amount || "0").replace(/[^0-9.]/g, "")))[0]?.merchant || "none"}.`
        : "I do not see subscriptions yet. Add a statement or use the seeded credit card document.",
      accessed,
    };
  }

  if (q.includes("lease") || q.includes("rent")) {
    const leaseFacts = state.facts.filter((item) => `${item.label} ${item.category}`.toLowerCase().includes("lease") || `${item.label} ${item.category}`.toLowerCase().includes("rent") || `${item.category}`.toLowerCase().includes("housing"));
    accessed.push(...leaseFacts.map((item) => `${item.label}: ${item.value}`));
    const expiration = state.facts.find((item) => item.label?.toLowerCase().includes("expiration"));
    const deadline = state.deadlines.find((item) => item.title?.toLowerCase().includes("lease"));
    return {
      answer: `Your lease information shows ${expiration ? `an expiration of ${expiration.value}` : "a lease renewal on file"}. ${deadline ? `You should respond by ${deadline.date}: ${deadline.nextStep}` : "I do not see a response deadline yet."}`,
      accessed,
    };
  }

  if (q.includes("urgent") || q.includes("due")) {
    const urgent = [...state.deadlines, ...state.actionItems].slice(0, 5);
    accessed.push(...urgent.map((item) => item.title));
    return {
      answer: urgent.length
        ? `Most urgent items: ${urgent.map((item) => `${item.title}${item.date || item.dueDate ? ` (${item.date || item.dueDate})` : ""}`).join("; ")}.`
        : "No urgent items yet.",
      accessed,
    };
  }

  const matches = searchLocalMemory(query);
  accessed.push(...matches.slice(0, 6).map((item) => item.label || item.title || item.merchant || item.name || "memory"));
  return {
    answer: matches.length
      ? `I found ${matches.length} relevant private records. The most relevant are: ${matches.slice(0, 4).map((item) => item.label ? `${item.label}: ${item.value}` : item.title || item.merchant || item.name).join("; ")}.`
      : "I could not find that in your PaperTrail documents yet.",
    accessed,
  };
}

export async function askPaperTrail(query) {
  const local = localAnswer(query);
  const state = getState();
  const memories = searchLocalMemory(query);
  const userToken = await getUserToken().catch(() => null);

  if (!userToken) {
    return {
      ...local,
      provider: "local",
      sources: [...new Set(memories.map((item) => item.sourceDocument).filter(Boolean))],
      privateFactsAccessed: local.accessed,
    };
  }

  try {
    const compactContext = JSON.stringify({
      documents: state.documents.map((doc) => ({ name: doc.name, type: doc.documentType, summary: doc.summary })),
      relevantRecords: memories.slice(0, 12),
      urgent: [...state.deadlines, ...state.actionItems].slice(0, 8),
    }).slice(0, 2300);
    const response = await fetch("https://krava.io/api/platform/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-privy-token": userToken,
      },
      body: JSON.stringify({
        message: `Question: ${query}\n\nRelevant PaperTrail private context:\n${compactContext}`,
        system:
          "You are PaperTrail, a concise private life-admin assistant. Answer only from the provided document memory. Include dates, amounts, and source document names when available. Mention if sensitive facts were accessed.",
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
        sources: [...new Set(memories.map((item) => item.sourceDocument).filter(Boolean))],
        privateFactsAccessed: local.accessed,
      };
    }
  } catch {
    // Fall through to the lower-level raw agent API, then local fallback.
  }

  try {
    const client = createKravaClient({ getToken: () => userToken });
    const kravaSearch = await client.memory.search(query, 12).catch(() => ({ memories: [] }));
    const { gatewayToken } = await client.agent.getGatewayCredentials();
    const response = await client.v1.agentChat(
      {
        model: "claude-haiku-4-5-20251001",
        stream: false,
        system: "You are PaperTrail, a concise private life-admin assistant. Answer only from provided document memory. Mention when facts are private.",
        messages: [
          {
            role: "user",
            content: `Question: ${query}\n\nLocal extracted state:\n${JSON.stringify(state).slice(0, 12000)}\n\nKrava memories:\n${JSON.stringify(kravaSearch.memories).slice(0, 12000)}`,
          },
        ],
      },
      { gatewayToken },
    );
    const body = await response.json();
    const answer = body?.content?.[0]?.text || body?.text || body?.message || local.answer;
    return {
      answer,
      provider: "krava",
      sources: [...new Set(memories.map((item) => item.sourceDocument).filter(Boolean))],
      privateFactsAccessed: local.accessed,
    };
  } catch (error) {
    return {
      ...local,
      provider: "local-fallback",
      warning: error.message,
      sources: [...new Set(memories.map((item) => item.sourceDocument).filter(Boolean))],
      privateFactsAccessed: local.accessed,
    };
  }
}
