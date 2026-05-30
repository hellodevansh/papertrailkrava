import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const STORE_KEY = "papertrail:state";

const initialState = {
  documents: [],
  facts: [],
  deadlines: [],
  subscriptions: [],
  payments: [],
  contacts: [],
  actionItems: [],
  sensitiveFields: [],
  consentDecisions: [],
  linqActivities: [],
  webhookEvents: [],
  linqChatId: null,
  updatedAt: null,
};

const filePath = resolve(process.cwd(), ".papertrail-data/store.json");

let storeReady = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function redisEnvReady() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return Boolean(url && token);
}

async function getRedis() {
  if (!redisEnvReady()) return null;
  const { Redis } = await import("@upstash/redis");
  if (process.env.UPSTASH_REDIS_REST_URL) {
    return Redis.fromEnv();
  }
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

async function readKvState() {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const saved = await redis.get(STORE_KEY);
    if (!saved || typeof saved !== "object") return null;
    return { ...clone(initialState), ...saved };
  } catch {
    return null;
  }
}

async function writeKvState(state) {
  const redis = await getRedis();
  if (!redis) return false;
  try {
    await redis.set(STORE_KEY, clone(state));
    return true;
  } catch {
    return false;
  }
}

function getGlobalState() {
  if (!globalThis.__paperTrailState) {
    globalThis.__paperTrailState = clone(initialState);
  }
  return globalThis.__paperTrailState;
}

function loadFromDisk() {
  if (!existsSync(filePath)) return clone(initialState);
  try {
    return { ...clone(initialState), ...JSON.parse(readFileSync(filePath, "utf8")) };
  } catch {
    return clone(initialState);
  }
}

export async function ensureStore() {
  if (!storeReady) {
    storeReady = (async () => {
      if (globalThis.__paperTrailState) return;

      const kvState = await readKvState();
      if (kvState) {
        globalThis.__paperTrailState = kvState;
        return;
      }

      if (process.env.VERCEL) {
        globalThis.__paperTrailState = clone(initialState);
        return;
      }

      globalThis.__paperTrailState = loadFromDisk();
    })();
  }
  await storeReady;
}

export function getStorageStatus() {
  if (redisEnvReady()) return { mode: "vercel-redis", durable: true };
  if (process.env.VERCEL) {
    return {
      mode: "ephemeral",
      durable: false,
      note: "Add Upstash Redis from Vercel Marketplace (Storage) so uploads persist across serverless requests.",
    };
  }
  return { mode: "local-file", durable: true, path: ".papertrail-data/store.json" };
}

async function persist(state) {
  state.updatedAt = new Date().toISOString();

  if (await writeKvState(state)) return;

  if (process.env.VERCEL) return;

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function withIds(items, document) {
  return (items || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    sourceDocumentId: document.documentId,
    sourceDocument: document.documentName,
    ...item,
  }));
}

export function getState() {
  return clone(getGlobalState());
}

export async function resetState() {
  await ensureStore();
  globalThis.__paperTrailState = clone(initialState);
  await persist(globalThis.__paperTrailState);
  return getState();
}

export async function upsertExtraction(extraction, original = {}) {
  await ensureStore();
  const state = getGlobalState();
  const document = {
    id: extraction.documentId || crypto.randomUUID(),
    name: extraction.documentName || original.name || "Untitled document",
    documentType: extraction.documentType || "unknown",
    summary: extraction.summary || "",
    uploadedAt: new Date().toISOString(),
    mimeType: original.mimeType || "text/plain",
  };

  extraction.documentId = document.id;
  extraction.documentName = document.name;

  state.documents = [...state.documents.filter((item) => item.id !== document.id), document];

  const replaceByDoc = (collection, incoming) => [
    ...collection.filter((item) => item.sourceDocumentId !== document.id),
    ...withIds(incoming, extraction),
  ];

  state.facts = replaceByDoc(state.facts, extraction.facts);
  state.deadlines = replaceByDoc(state.deadlines, extraction.deadlines);
  state.subscriptions = replaceByDoc(state.subscriptions, extraction.subscriptions);
  state.payments = replaceByDoc(state.payments, extraction.payments);
  state.contacts = replaceByDoc(state.contacts, extraction.contacts);
  state.actionItems = replaceByDoc(state.actionItems, extraction.actionItems);
  state.sensitiveFields = replaceByDoc(state.sensitiveFields, extraction.sensitiveFields).map((field) => ({
    approved: false,
    locked: true,
    ...field,
  }));

  await persist(state);
  return getState();
}

export async function setLinqChatId(chatId) {
  await ensureStore();
  const state = getGlobalState();
  state.linqChatId = chatId;
  await persist(state);
}

export async function addLinqActivity(activity) {
  await ensureStore();
  const state = getGlobalState();
  state.linqActivities = [
    {
      id: activity.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...activity,
    },
    ...state.linqActivities,
  ].slice(0, 40);
  await persist(state);
  return getState();
}

export async function hasWebhookEvent(id) {
  await ensureStore();
  return Boolean(id && getGlobalState().webhookEvents.includes(id));
}

export async function recordWebhookEvent(id) {
  if (!id) return;
  await ensureStore();
  const state = getGlobalState();
  state.webhookEvents = [id, ...state.webhookEvents.filter((eventId) => eventId !== id)].slice(0, 120);
  await persist(state);
}

export async function applyConsentCommand(text) {
  await ensureStore();
  const state = getGlobalState();
  const normalized = text.toLowerCase();
  const approved = normalized.includes("approve")
    ? ["address", "rent", "rent amount", "claim", "claim number"].filter((term) => normalized.includes(term.split(" ")[0]))
    : [];
  const denied = normalized.includes("deny") || normalized.includes("no")
    ? ["medical", "health", "reason", "personal", "accommodation"].filter((term) => normalized.includes(term) || (normalized.includes("medical") && ["health", "reason", "personal", "accommodation"].includes(term)))
    : [];

  state.sensitiveFields = state.sensitiveFields.map((field) => {
    const haystack = `${field.label || ""} ${field.value || ""} ${field.category || ""}`.toLowerCase();
    const isApproved = approved.some((term) => haystack.includes(term));
    const isDenied = denied.some((term) => haystack.includes(term));
    if (!isApproved && !isDenied) return field;
    return { ...field, approved: isApproved, locked: !isApproved, denied: isDenied };
  });

  state.consentDecisions.unshift({
    id: crypto.randomUUID(),
    command: text,
    approved,
    denied,
    createdAt: new Date().toISOString(),
  });
  await persist(state);
  return getState();
}

export function searchLocalMemory(query) {
  const state = getGlobalState();
  const q = query.toLowerCase();
  const all = [
    ...state.facts,
    ...state.deadlines,
    ...state.subscriptions,
    ...state.payments,
    ...state.contacts,
    ...state.actionItems,
    ...state.sensitiveFields,
  ];

  return all
    .filter((item) => JSON.stringify(item).toLowerCase().includes(q) || q.split(/\s+/).some((word) => JSON.stringify(item).toLowerCase().includes(word)))
    .slice(0, 16);
}
