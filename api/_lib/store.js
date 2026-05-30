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

function parseRedisValue(saved) {
  if (!saved) return null;
  if (typeof saved === "string") {
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }
  if (typeof saved === "object") return saved;
  return null;
}

export function redisEnvReady() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_TOKEN;
  return Boolean(url && token);
}

export async function getRedis() {
  if (!redisEnvReady()) return null;
  const { Redis } = await import("@upstash/redis");
  if (process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL) {
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
    const saved = parseRedisValue(await redis.get(STORE_KEY));
    if (!saved) return null;
    return { ...clone(initialState), ...saved };
  } catch {
    return null;
  }
}

async function writeKvState(state) {
  const redis = await getRedis();
  if (!redis) return { ok: false, error: "Redis client not configured" };
  try {
    const payload = clone(state);
    await redis.set(STORE_KEY, payload);
    const check = parseRedisValue(await redis.get(STORE_KEY));
    if (!check?.documents?.length && payload.documents?.length) {
      return { ok: false, error: "Redis write verification failed" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Redis write failed" };
  }
}

export async function checkRedisHealth() {
  if (!redisEnvReady()) {
    return {
      ok: false,
      configured: false,
      envVars: {
        UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
        UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
        KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
        KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
      },
    };
  }
  try {
    const redis = await getRedis();
    if (!redis) return { ok: false, configured: true, error: "Could not create Redis client" };
    const ping = typeof redis.ping === "function" ? await redis.ping() : "skip";
    const saved = parseRedisValue(await redis.get(STORE_KEY));
    return {
      ok: true,
      configured: true,
      ping,
      documentCount: saved?.documents?.length || 0,
      factCount: saved?.facts?.length || 0,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Redis health check failed",
    };
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
  if (redisEnvReady()) {
    const kvState = await readKvState();
    globalThis.__paperTrailState = kvState || clone(initialState);
    return;
  }

  if (!storeReady) {
    storeReady = (async () => {
      if (globalThis.__paperTrailState) return;

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
      note: "Connect Upstash to this Vercel project, then redeploy. Env vars: UPSTASH_REDIS_REST_URL + TOKEN or KV_REST_API_*",
    };
  }
  return { mode: "local-file", durable: true, path: ".papertrail-data/store.json" };
}

async function persist(state) {
  state.updatedAt = new Date().toISOString();

  if (redisEnvReady()) {
    return writeKvState(state);
  }

  if (process.env.VERCEL) {
    return { ok: false, error: "No Redis on Vercel — data only lives in this request" };
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2));
  return { ok: true };
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

export function pickStateForAsk(serverState, clientState) {
  const serverDocs = serverState?.documents?.length || 0;
  const clientDocs = clientState?.documents?.length || 0;
  if (clientDocs > serverDocs) {
    return { ...clone(initialState), ...clientState };
  }
  return serverState;
}

export async function saveFullState(incoming) {
  await ensureStore();
  const merged = { ...clone(initialState), ...incoming };
  globalThis.__paperTrailState = merged;
  const persistResult = await persist(merged);
  return { state: getState(), persist: persistResult };
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

  const persistResult = await persist(state);
  return { state: getState(), persist: persistResult };
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

export function searchLocalMemory(query, state = getGlobalState()) {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter((word) => word.length > 2);
  const docRecords = state.documents.map((doc) => ({
    label: doc.name,
    value: doc.summary,
    category: doc.documentType,
    sourceDocument: doc.name,
  }));
  const all = [
    ...docRecords,
    ...state.facts,
    ...state.deadlines,
    ...state.subscriptions,
    ...state.payments,
    ...state.contacts,
    ...state.actionItems,
    ...state.sensitiveFields,
  ];

  const haystackMatch = (item) => {
    const haystack = JSON.stringify(item).toLowerCase();
    return haystack.includes(q) || words.some((word) => haystack.includes(word));
  };

  const matches = all.filter(haystackMatch);
  if (matches.length) return matches.slice(0, 16);

  return all.slice(0, 12);
}
