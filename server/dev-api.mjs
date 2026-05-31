import { createServer } from "node:http";

const routes = {
  "/api/status": () => import("../api/status.js"),
  "/api/state": () => import("../api/state.js"),
  "/api/documents/extract": () => import("../api/documents/extract.js"),
  "/api/krava/session": () => import("../api/krava/session.js"),
  "/api/krava/memory": () => import("../api/krava/memory.js"),
  "/api/krava/ask": () => import("../api/krava/ask.js"),
  "/api/linq/send": () => import("../api/linq/send.js"),
  "/api/linq/reply": () => import("../api/linq/reply.js"),
  "/api/linq/webhook": () => import("../api/linq/webhook.js"),
  "/api/reminders/preview": () => import("../api/reminders/preview.js"),
  "/api/reminders/fire": () => import("../api/reminders/fire.js"),
};

createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const loader = routes[pathname];
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-webhook-signature,x-webhook-timestamp");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!loader) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const mod = await loader();
    await mod.default(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "API route failed", details: error.message }));
  }
}).listen(Number(process.env.PORT) || 5174, () => {
  console.log(`PaperTrail API ready on http://localhost:${Number(process.env.PORT) || 5174}`);
});
