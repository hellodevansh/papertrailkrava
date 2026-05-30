import { allowMethods, sendJson, withStore } from "../_lib/http.js";
import { getKravaSession } from "../_lib/krava.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  sendJson(res, 200, await getKravaSession());
});
