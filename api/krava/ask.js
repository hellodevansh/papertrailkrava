import { allowMethods, readJson, sendError, sendJson, withStore } from "../_lib/http.js";
import { askPaperTrail } from "../_lib/krava.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  const body = await readJson(req);
  if (!body.query) {
    sendError(res, 400, "A query is required.");
    return;
  }

  sendJson(res, 200, await askPaperTrail(body.query));
});
