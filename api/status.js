import { allowMethods, sendJson, withStore } from "./_lib/http.js";
import { envStatus } from "./_lib/env.js";
import { getKravaSession } from "./_lib/krava.js";
import { getLinqStatus } from "./_lib/linq.js";
import { getState, getStorageStatus } from "./_lib/store.js";

export default withStore(async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  const krava = await getKravaSession();
  sendJson(res, 200, {
    env: envStatus(),
    krava,
    linq: getLinqStatus(),
    storage: getStorageStatus(),
    state: getState(),
  });
});
