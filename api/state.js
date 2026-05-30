import { allowMethods, readJson, sendJson, withStore } from "./_lib/http.js";
import { getState, resetState, saveFullState } from "./_lib/store.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;
  if (req.method === "POST") {
    const body = await readJson(req);
    if (body.action === "reset") {
      sendJson(res, 200, { state: await resetState() });
      return;
    }
    if (body.state?.documents?.length) {
      const result = await saveFullState(body.state);
      sendJson(res, 200, result);
      return;
    }
  }
  sendJson(res, 200, { state: getState() });
});
