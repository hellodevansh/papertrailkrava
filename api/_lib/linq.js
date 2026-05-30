import crypto from "node:crypto";
import { loadEnv } from "./env.js";
import { addLinqActivity, applyConsentCommand, getState, setLinqChatId } from "./store.js";
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

async function recordDemoActivity({ direction, kind, text, status, messageId }) {
  const phones = demoPhones(direction);
  await addLinqActivity({
    direction,
    kind,
    text,
    status,
    messageId: messageId || `demo-${crypto.randomUUID()}`,
    channel: "imessage",
    from: phones.from,
    to: phones.to,
  });
}

async function sendLinqMessageDemo(text, kind = "message") {
  const state = getState();
  if (!state.linqChatId) await setLinqChatId(demoChatId());

  await recordDemoActivity({
    direction: "outbound",
    kind,
    text,
    status: "sent",
  });
  await recordDemoActivity({
    direction: "outbound",
    kind: "message.delivered",
    text: "(delivered)",
    status: "delivered",
  });

  return { sent: true, mode: "demo", simulated: true, state: getState() };
}

async function sendLinqMessageLive(text, kind = "message") {
  const { default: LinqAPIV3 } = await import("@linqapp/sdk");
  const linq = new LinqAPIV3({ apiKey: process.env.LINQ_API_KEY });
  const state = getState();
  const message = {
    parts: [{ type: "text", value: text }],
    idempotency_key: `papertrail-${kind}-${Date.now()}`,
  };

  if (state.linqChatId) {
    const result = await linq.chats.messages.send(state.linqChatId, { message });
    await addLinqActivity({
      direction: "outbound",
      kind,
      text,
      status: result.message.delivery_status,
      messageId: result.message.id,
      channel: "imessage",
    });
    return { sent: true, mode: "live", result, state: getState() };
  }

  const result = await linq.chats.create({
    from: process.env.LINQ_FROM_PHONE,
    to: [process.env.DEMO_APPROVER_PHONE],
    message,
  });
  await setLinqChatId(result.chat.id);
  await addLinqActivity({
    direction: "outbound",
    kind,
    text,
    status: result.chat.message.delivery_status,
    messageId: result.chat.message.id,
    channel: "imessage",
  });
  return { sent: true, mode: "live", result, state: getState() };
}

export async function sendLinqMessage(text, kind = "message") {
  loadEnv();
  if (isLinqLive()) return sendLinqMessageLive(text, kind);
  return sendLinqMessageDemo(text, kind);
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

export async function handleInboundLinq(payload) {
  const eventType = payload.event_type || payload.type || payload.event;
  const eventId = payload.id || payload.event_id || payload.data?.id;
  const message = payload.message || payload.data || payload;
  const text = textFromMessageParts(message.parts || message.message?.parts || []);

  if (isLinqLive()) {
    await addLinqActivity({
      id: eventId || undefined,
      direction: "inbound",
      kind: eventType || "message.received",
      text: text || "(non-text message)",
      status: "received",
      channel: "imessage",
    });
  } else {
    await recordDemoActivity({
      direction: "inbound",
      kind: eventType || "message.received",
      text: text || "(non-text message)",
      status: "received",
      messageId: eventId,
    });
  }

  if (!text) return { handled: false, reason: "No text parts", mode: getLinqStatus().mode };

  const lower = text.toLowerCase();
  if (lower.includes("approve") || lower.includes("deny") || lower.includes(" no ")) {
    const state = await applyConsentCommand(text);
    await sendLinqMessage(
      "PaperTrail updated your consent settings. Locked facts stay out of drafts until you approve them.",
      "consent-confirmation",
    );
    return { handled: true, action: "consent", mode: getLinqStatus().mode, state };
  }

  const answer = await askPaperTrail(text);
  await sendLinqMessage(answer.answer.slice(0, 1500), "answer");
  return { handled: true, action: "answer", mode: getLinqStatus().mode, answer };
}

/** Simulates an inbound iMessage (same path as production webhook handler). */
export async function simulateInboundMessage(text) {
  if (!text?.trim()) throw new Error("Reply text is required.");
  return handleInboundLinq({
    id: crypto.randomUUID(),
    event_type: "message.received",
    message: { parts: [{ type: "text", value: text.trim() }] },
  });
}

export function approvalPrompt() {
  return `PaperTrail found sensitive facts for your landlord reply.

Approve using:
1. Address
2. Rent amount
3. Personal/medical reason

Reply: approve address rent, deny medical`;
}
