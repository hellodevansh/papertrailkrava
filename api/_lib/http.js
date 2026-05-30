export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function sendError(res, status, message, details) {
  sendJson(res, status, { error: message, details });
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  sendError(res, 405, "Method not allowed");
  return false;
}

/** Hydrates persisted state (Vercel KV or local disk) before each API handler runs. */
export function withStore(handler) {
  return async (req, res) => {
    const { ensureStore } = await import("./store.js");
    await ensureStore();
    return handler(req, res);
  };
}

export function textFromMessageParts(parts = []) {
  return parts
    .filter((part) => part?.type === "text" && typeof part.value === "string")
    .map((part) => part.value)
    .join("\n")
    .trim();
}
