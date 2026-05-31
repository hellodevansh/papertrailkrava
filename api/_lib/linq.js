import crypto from "node:crypto";
import { loadEnv } from "./env.js";
import { addLinqActivity, getState, setLinqChatId } from "./store.js";
import { textFromMessageParts } from "./http.js";
import { askPaperTrail } from "./krava.js";

export const DEMO_LINQ_FROM = "+1 (415) 555-0142";
export const DEMO_LINQ_TO = "+1 (415) 555-0198";

function demoChatId() {
  return "demo-linq-chat-papertrail";
}

export function isLinqLive() {
  loadEnv();
  if ((process.env.LINQ_MODE || "demo").toLowerCase() !== "live") return false;
  return Boolean(
    process.env.LINQ_API_KEY && process.env.LINQ_FROM_PHONE && process.env.DEMO_APPROVER_PHONE,
  );
}

export function getLinqStatus() {
  loadEnv();
  const live = isLinqLive();
  return {
    mode: live ? "live" : "demo",
    ready: true,
    from: process.env.LINQ_FROM_PHONE || DEMO_LINQ_FROM,
    to: process.env.DEMO_APPROVER_PHONE || DEMO_LINQ_TO,
    integration: live ? "linq-partner-api-v3" : "simulated-imessage",
    webhook: live ? Boolean(process.env.LINQ_WEBHOOK_SIGNING_SECRET) : "simulated",
    note: live
      ? "Live Linq iMessage integration."
      : "Hackathon demo: full iMessage + webhook flow without Linq API keys. Set LINQ_MODE=live when credentials are available.",
  };
}

function demoPhones(direction) {
  const from = process.env.LINQ_FROM_PHONE || DEMO_LINQ_FROM;
  const to = process.env.DEMO_APPROVER_PHONE || DEMO_LINQ_TO;
  return direction === "outbound" ? { from, to } : { from: to, to: from };
}

async function recordDemoActivity(activity, working) {
  const phones = demoPhones(activity.direction);
  return addLinqActivity(
    {
      ...activity,
      messageId: activity.messageId || `demo-${crypto.randomUUID()}`,
      channel: "imessage",
      from: phones.from,
      to: phones.to,
    },
    working,
  );
}

// Screen effects supported by Linq iMessage (v3). We normalize a friendly name
// into the {name,type} shape the API expects.
const SCREEN_EFFECTS = new Set(["confetti", "fireworks", "lasers", "sparkles", "celebration", "hearts", "love", "balloons", "happy_birthday", "echo", "spotlight"]);
const BUBBLE_EFFECTS = new Set(["slam", "loud", "gentle", "invisible"]);

function normalizeEffect(effect) {
  if (!effect) return null;
  const name = String(effect).toLowerCase();
  if (SCREEN_EFFECTS.has(name)) return { name, type: "screen" };
  if (BUBBLE_EFFECTS.has(name)) return { name, type: "bubble" };
  return null;
}

async function sendLinqMessageDemo(text, kind = "message", baseState = null, options = {}) {
  let working = baseState || getState();
  if (!working.linqChatId) {
    await setLinqChatId(demoChatId(), working);
    working = { ...working, linqChatId: demoChatId() };
  }

  working = await recordDemoActivity({ direction: "outbound", kind, text, status: "sent", effect: options.effect || null }, working);
  working = await recordDemoActivity(
    { direction: "outbound", kind: "message.delivered", text: "(delivered)", status: "delivered" },
    working,
  );

  return { sent: true, mode: "demo", simulated: true, state: working };
}

async function sendLinqMessageLive(text, kind = "message", baseState = null, options = {}) {
  const { default: LinqAPIV3 } = await import("@linqapp/sdk");
  const linq = new LinqAPIV3({ apiKey: process.env.LINQ_API_KEY });
  let working = baseState || getState();
  const effect = normalizeEffect(options.effect);
  const message = {
    parts: [{ type: "text", value: text }],
    preferred_service: "iMessage",
    idempotency_key: `papertrail-${kind}-${Date.now()}`,
    ...(effect ? { effect } : {}),
  };

  if (working.linqChatId) {
    const result = await linq.chats.messages.send(working.linqChatId, { message });
    working = await addLinqActivity(
      {
        direction: "outbound",
        kind,
        text,
        status: result.message.delivery_status,
        messageId: result.message.id,
        channel: "imessage",
        effect: options.effect || null,
      },
      working,
    );
    return { sent: true, mode: "live", result, state: working };
  }

  const result = await linq.chats.create({
    from: process.env.LINQ_FROM_PHONE,
    to: [process.env.DEMO_APPROVER_PHONE],
    message,
  });
  working = { ...working, linqChatId: result.chat.id };
  await setLinqChatId(result.chat.id, working);
  working = await addLinqActivity(
    {
      direction: "outbound",
      kind,
      text,
      status: result.chat.message.delivery_status,
      messageId: result.chat.message.id,
      channel: "imessage",
      effect: options.effect || null,
    },
    working,
  );
  return { sent: true, mode: "live", result, state: working };
}

export async function sendLinqMessage(text, kind = "message", baseState = null, options = {}) {
  loadEnv();
  if (isLinqLive()) return sendLinqMessageLive(text, kind, baseState, options);
  return sendLinqMessageDemo(text, kind, baseState, options);
}

export function verifyLinqSignature(rawBody, headers) {
  if (!isLinqLive()) return { ok: true, mode: "demo" };

  loadEnv();
  const secret = process.env.LINQ_WEBHOOK_SIGNING_SECRET;
  if (!secret) return { ok: false, reason: "Missing webhook signing secret" };

  const timestamp = headers["x-webhook-timestamp"];
  const signature = headers["x-webhook-signature"];
  if (!timestamp || !signature) return { ok: false, reason: "Missing webhook signature headers" };

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "Webhook timestamp is too old" };

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const ok =
    Buffer.byteLength(expected) === Buffer.byteLength(signature) &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  return { ok, reason: ok ? null : "Invalid webhook signature", mode: "live" };
}

export async function handleInboundLinq(payload, baseState = null) {
  let working = baseState || getState();
  const eventType = payload.event_type || payload.type || payload.event;
  const eventId = payload.id || payload.event_id || payload.data?.id;
  const message = payload.message || payload.data || payload;
  const text = textFromMessageParts(message.parts || message.message?.parts || []);

  working = await addLinqActivity(
    {
      id: eventId || undefined,
      direction: "inbound",
      kind: eventType || "message.received",
      text: text || "(non-text message)",
      status: "received",
      channel: "imessage",
    },
    working,
  );

  if (!text) return { handled: false, reason: "No text parts", mode: getLinqStatus().mode, state: working };

  // Two-way loop: a short "checklist" reply to a reminder expands into a richer ask.
  const normalized = text.trim().toLowerCase();
  const query = /^(checklist|check list|list|what do i need\??)$/.test(normalized)
    ? "Give me a short checklist of the documents and steps I need to prepare for my upcoming deadlines and any appeal. Use bullet points."
    : text;

  const answer = await askPaperTrail(query, working);
  const sent = await sendLinqMessage(answer.answer.slice(0, 1500), "answer", working);
  return { handled: true, action: "answer", mode: getLinqStatus().mode, answer, state: sent.state || working };
}

export async function simulateInboundMessage(text, baseState = null) {
  if (!text?.trim()) throw new Error("Reply text is required.");
  return handleInboundLinq(
    {
      id: crypto.randomUUID(),
      event_type: "message.received",
      message: { parts: [{ type: "text", value: text.trim() }] },
    },
    baseState,
  );
}

