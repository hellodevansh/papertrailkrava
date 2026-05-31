const initialState = {
  documents: [],
  facts: [],
  deadlines: [],
  subscriptions: [],
  payments: [],
  contacts: [],
  actionItems: [],
  keyDetails: [],
  linqActivities: [],
  webhookEvents: [],
  linqChatId: null,
  updatedAt: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getStorageStatus() {
  return {
    mode: "none",
    durable: false,
    note: "Nothing is stored. Documents and extracted details live only in your browser tab and clear on refresh.",
  };
}

function useBaseState(baseState) {
  // Seed this request's ephemeral memory with the full client snapshot so Krava
  // can reason over it. It is never persisted anywhere.
  if (baseState && typeof baseState === "object") {
    globalThis.__paperTrailState = { ...clone(initialState), ...baseState };
  } else if (!globalThis.__paperTrailState) {
    globalThis.__paperTrailState = clone(initialState);
  }
}

function getGlobalState() {
  return globalThis.__paperTrailState || clone(initialState);
}

// Zero-storage: state lives only for the duration of a single request, seeded
// from the client snapshot. Nothing is written to disk or kept across requests.
function persistCatalog() {
  // intentionally a no-op — PaperTrail does not persist anything.
}

export async function ensureStore(baseState = null) {
  if (baseState && typeof baseState === "object") {
    useBaseState(baseState);
    return;
  }
  globalThis.__paperTrailState = clone(initialState);
}

export function getState() {
  return clone(getGlobalState());
}

export function sessionState(clientState = null) {
  if (clientState && typeof clientState === "object" && clientState.documents?.length) {
    return { ...clone(initialState), ...clientState };
  }
  return getState();
}

export async function resetState() {
  globalThis.__paperTrailState = clone(initialState);
  persistCatalog(globalThis.__paperTrailState);
  return getState();
}

function withIds(items, document) {
  return (items || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    sourceDocumentId: document.documentId,
    sourceDocument: document.documentName,
    ...item,
  }));
}

function mergeExtractionIntoState(baseState, extraction, original) {
  const state = { ...clone(initialState), ...baseState };
  const document = {
    id: extraction.documentId || crypto.randomUUID(),
    name: extraction.documentName || original.name || "Untitled document",
    documentType: extraction.documentType || "unknown",
    summary: extraction.summary || "",
    suggestedQuestions: Array.isArray(extraction.questionsAnsweredByThisDoc)
      ? extraction.questionsAnsweredByThisDoc.filter((q) => typeof q === "string" && q.trim()).slice(0, 4)
      : [],
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
  state.keyDetails = replaceByDoc(state.keyDetails, extraction.keyDetails);
  state.updatedAt = new Date().toISOString();
  return state;
}

/** Returns full session display state; persists document names only. */
export async function upsertExtraction(extraction, original = {}, baseState = null) {
  const workingBase = { ...clone(initialState), ...(baseState || getGlobalState()) };
  const displayState = mergeExtractionIntoState(workingBase, extraction, original);
  persistCatalog(displayState);
  return clone(displayState);
}

export async function setLinqChatId(chatId, baseState = null) {
  const working = { ...clone(initialState), ...(baseState || getGlobalState()) };
  working.linqChatId = chatId;
  persistCatalog(working);
}

export async function addLinqActivity(activity, baseState = null) {
  const working = { ...clone(initialState), ...(baseState || getGlobalState()) };
  working.linqActivities = [
    {
      id: activity.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...activity,
    },
    ...working.linqActivities,
  ].slice(0, 40);
  working.updatedAt = new Date().toISOString();
  persistCatalog(working);
  return clone(working);
}

export async function hasWebhookEvent(id) {
  return Boolean(id && getGlobalState().webhookEvents?.includes(id));
}

export async function recordWebhookEvent(id) {
  if (!id) return;
  const state = getGlobalState();
  state.webhookEvents = [id, ...(state.webhookEvents || []).filter((eventId) => eventId !== id)].slice(0, 120);
}

export function searchLocalMemory(query, state) {
  const snapshot = state || getGlobalState();
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter((word) => word.length > 2);
  const docRecords = snapshot.documents.map((doc) => ({
    label: doc.name,
    value: doc.summary,
    category: doc.documentType,
    sourceDocument: doc.name,
  }));
  const all = [
    ...docRecords,
    ...snapshot.facts,
    ...snapshot.deadlines,
    ...snapshot.subscriptions,
    ...snapshot.payments,
    ...snapshot.contacts,
    ...snapshot.actionItems,
    ...snapshot.keyDetails,
  ];

  const haystackMatch = (item) => {
    const haystack = JSON.stringify(item).toLowerCase();
    return haystack.includes(q) || words.some((word) => haystack.includes(word));
  };

  const matches = all.filter(haystackMatch);
  if (matches.length) return matches.slice(0, 16);

  return all.slice(0, 12);
}
