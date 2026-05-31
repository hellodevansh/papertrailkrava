import { allowMethods, readBody, sendError, sendJson, withStore } from "../_lib/http.js";
import { handleInboundLinq, verifyLinqSignature } from "../_lib/linq.js";
import { hasWebhookEvent, recordWebhookEvent } from "../_lib/store.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  const rawBody = await readBody(req);
  const verification = verifyLinqSignature(rawBody, req.headers);
  if (!verification.ok && process.env.LINQ_WEBHOOK_SIGNING_SECRET) {
    sendError(res, 401, verification.reason || "Invalid webhook signature");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch (error) {
    sendError(res, 400, "Invalid webhook JSON.", error.message);
    return;
  }

  const eventId = payload.id || payload.event_id || payload.data?.id || payload.message?.id;
  if (await hasWebhookEvent(eventId)) {
    sendJson(res, 200, { ok: true, duplicate: true });
    return;
  }
  await recordWebhookEvent(eventId);

  const payloadState = payload.state || payload.clientState || null;

  try {
    const result = await handleInboundLinq(payload, payloadState);
    sendJson(res, 200, { ok: true, result, state: result.state || null });
  } catch (error) {
    sendError(res, 500, "Webhook handling failed.", error.message);
  }
});
