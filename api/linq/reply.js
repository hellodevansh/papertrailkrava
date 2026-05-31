import { allowMethods, readJson, sendError, sendJson, withStore } from "../_lib/http.js";
import { getLinqStatus, simulateInboundMessage } from "../_lib/linq.js";
import { getState } from "../_lib/store.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const body = await readJson(req);
    if (!body.text?.trim()) {
      sendError(res, 400, "Reply text is required.");
      return;
    }

    const result = await simulateInboundMessage(body.text, body.state);
    sendJson(res, 200, {
      ok: true,
      linq: getLinqStatus(),
      result,
      state: result.state || getState(),
    });
  } catch (error) {
    sendError(res, 500, "Simulated iMessage reply failed.", error.message);
  }
});
