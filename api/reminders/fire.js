import { allowMethods, readJson, sendError, sendJson, withStore } from "../_lib/http.js";
import { dueReminders } from "../_lib/reminders.js";
import { getLinqStatus, sendLinqMessage } from "../_lib/linq.js";
import { sessionState } from "../_lib/store.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;

  try {
    const body = await readJson(req);
    let working = sessionState(body.state);
    const now = body.now || Date.now();
    const firedIds = Array.isArray(body.firedIds) ? body.firedIds : [];

    // If a specific reminder id is requested (manual "Send now"), only fire that one.
    let toFire = dueReminders(working, now, firedIds);
    if (body.id) toFire = toFire.filter((r) => r.id === body.id);

    const fired = [];
    for (const reminder of toFire) {
      const result = await sendLinqMessage(reminder.body, "reminder", working);
      working = result.state || working;
      fired.push(reminder.id);
    }

    sendJson(res, 200, { fired, state: working, linq: getLinqStatus() });
  } catch (error) {
    sendError(res, 500, "Reminder send failed.", error.message);
  }
});
