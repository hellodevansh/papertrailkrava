import { allowMethods, readJson, sendError, sendJson, withStore } from "../_lib/http.js";
import { readDocumentText } from "../_lib/gemini.js";
import { upsertExtraction } from "../_lib/store.js";
import { extractDocumentWithKrava, savePaperTrailMemories } from "../_lib/krava.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const body = await readJson(req);
    if (!body.name && !body.text && !body.dataBase64) {
      sendError(res, 400, "Document name, text, or file data is required.");
      return;
    }

    const reader = await readDocumentText(body);
    const { extraction, provider, warning } = await extractDocumentWithKrava(body, reader.text);
    const state = await upsertExtraction(extraction, body);
    const krava = await savePaperTrailMemories(extraction);

    sendJson(res, 200, {
      extraction,
      provider,
      reader,
      warning: warning || reader.warning,
      krava,
      state,
    });
  } catch (error) {
    sendError(res, 500, "Document extraction failed.", error.message);
  }
});
