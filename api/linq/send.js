import { allowMethods, readJson, sendError, sendJson, withStore } from "../_lib/http.js";
import { approvalPrompt, getLinqStatus, sendLinqMessage } from "../_lib/linq.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const body = await readJson(req);
    const kind = body.kind || "message";
    const text = body.text || (kind === "approval" ? approvalPrompt() : "");
    if (!text) {
      sendError(res, 400, "Message text is required.");
      return;
    }

    const result = await sendLinqMessage(text, kind);
    sendJson(res, 200, { ...result, linq: getLinqStatus() });
  } catch (error) {
    sendError(res, 500, "Linq send failed.", error.message);
  }
});
