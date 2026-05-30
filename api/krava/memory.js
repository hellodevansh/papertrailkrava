import { allowMethods, readJson, sendJson, withStore } from "../_lib/http.js";
import { savePaperTrailMemories } from "../_lib/krava.js";
import { getState, searchLocalMemory } from "../_lib/store.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "POST"])) return;

  if (req.method === "POST") {
    const body = await readJson(req);
    sendJson(res, 200, await savePaperTrailMemories(body.extraction || {}));
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const query = url.searchParams.get("query") || "";
  sendJson(res, 200, {
    memories: query ? searchLocalMemory(query) : getState().facts,
    mode: "local-index",
  });
});
