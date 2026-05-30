import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;

  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;

    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function envStatus() {
  loadEnv();
  const linqMode = (process.env.LINQ_MODE || "demo").toLowerCase();
  const linqLive =
    linqMode === "live" &&
    Boolean(process.env.LINQ_API_KEY && process.env.LINQ_FROM_PHONE && process.env.DEMO_APPROVER_PHONE);

  return {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    krava: Boolean(process.env.KRAVA_APP_KEY),
    linq: linqLive || linqMode === "demo",
    linqMode: linqLive ? "live" : "demo",
    webhook: linqLive ? Boolean(process.env.LINQ_WEBHOOK_SIGNING_SECRET) : true,
  };
}
