import { allowMethods, readJson, sendError, sendJson, withStore } from "../_lib/http.js";
import { buildReminders } from "../_lib/reminders.js";
import { sessionState } from "../_lib/store.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const body = await readJson(req);
    const state = sessionState(body.state);
    const now = body.now || Date.now();
    sendJson(res, 200, { reminders: buildReminders(state, now), now });
  } catch (error) {
    sendError(res, 500, "Reminder preview failed.", error.message);
  }
});
