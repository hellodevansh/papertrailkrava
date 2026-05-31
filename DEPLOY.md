# Deploy PaperTrail to Vercel

## What Vercel runs

- **Frontend:** Vite build → `dist/` (SPA, rewrites to `index.html`)
- **API:** `api/**/*.js` serverless functions (60s max duration)
- **Config:** `vercel.json` (already set — do not change unless you know why)

Session data stays in the **browser**; the server does not persist uploads between requests.

---

## 1. Push code to GitHub

```bash
cd /Users/dimpleshah/Documents/krav_hack
git add -A
git commit -m "PaperTrail demo ready for Vercel"
```

Create a repo on GitHub (github.com → **New repository** → name e.g. `papertrail-demo` → **Create**).

```bash
git remote add origin git@github.com:YOUR_USER/papertrail-demo.git
git branch -M main
git push -u origin main
```

(Use HTTPS remote if you prefer: `https://github.com/YOUR_USER/papertrail-demo.git`.)

---

## 2. Import project in Vercel

1. Go to [vercel.com](https://vercel.com) → log in → **Add New…** → **Project**.
2. **Import** your GitHub repository.
3. Vercel should detect settings from `vercel.json`:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. **Do not deploy yet** — open **Environment Variables** first (step 3).

---

## 3. Environment variables

In the import screen (or **Project → Settings → Environment Variables**), add:

| Name | Value | Required for demo |
|------|--------|-------------------|
| `KRAVA_APP_KEY` | Your Krava app key | **Yes** — extraction & Q&A |
| `GEMINI_API_KEY` | Google AI / Gemini API key | **Yes** — PDF/image upload |
| `LINQ_MODE` | `demo` | **Yes** — iMessage demo without Linq keys |

**Hackathon demo (recommended):**

```
KRAVA_APP_KEY=sk-...your-key...
GEMINI_API_KEY=...your-gemini-key...
LINQ_MODE=demo
```

Apply to **Production**, **Preview**, and **Development**.

**Optional — live Linq later:**

```
LINQ_MODE=live
LINQ_API_KEY=...
LINQ_FROM_PHONE=+1...
DEMO_APPROVER_PHONE=+1...
LINQ_WEBHOOK_SIGNING_SECRET=...
```

Leave live vars unset for the stage demo; `demo` mode simulates iMessage in the UI.

**Never** commit `.env.local` — only set vars in Vercel (and locally).

---

## 4. Deploy

1. Click **Deploy**.
2. Wait for build (~1–2 min). Build must show: `tsc -b && vite build` succeeded.
3. Open the **Production** URL (e.g. `https://papertrail-demo.vercel.app`).

---

## 5. Smoke test (production)

| Check | How |
|-------|-----|
| API up | Visit `https://YOUR_URL/api/status` — JSON with `env`, `krava`, `linq` |
| Krava | `krava.connected` should be `true` if `KRAVA_APP_KEY` is valid |
| Gemini | `env.gemini` should be `true` if `GEMINI_API_KEY` is set |
| Linq | `linq.mode` should be `"demo"` |
| App UI | Open `/` → Home → upload `demo-documents/01-...pdf` from your laptop |
| Inbox | **Inbox** → time machine **+1 day** → **Send** on a reminder |

If PDF upload fails: confirm `GEMINI_API_KEY` on Vercel and redeploy after adding it.

---

## 6. Custom domain (optional)

**Project → Settings → Domains** → add your domain → follow DNS instructions.

---

## Redeploy after changes

```bash
git add -A && git commit -m "Your message" && git push
```

Vercel auto-deploys on push to `main`.

---

## CLI alternative

```bash
npm i -g vercel
cd /Users/dimpleshah/Documents/krav_hack
vercel login
vercel link
vercel env add KRAVA_APP_KEY
vercel env add GEMINI_API_KEY
vercel env add LINQ_MODE
vercel --prod
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 404 on refresh except home | `vercel.json` rewrites should be present — redeploy |
| Build fails on `tsc` | Run `npm run build` locally; fix TypeScript errors |
| `krava.connected: false` | Invalid/missing `KRAVA_APP_KEY` on Vercel |
| PDF extract 400 | Missing `GEMINI_API_KEY` |
| API 500 on extract | Check **Deployments → Functions** logs |
| Old UI after push | Hard refresh or open deployment URL from latest deploy |

**Logs:** Vercel → Project → **Deployments** → latest → **Functions** / **Build Logs**.

---

## Demo files

`demo-documents/` is **not** uploaded to Vercel (`.vercelignore`). Keep PDFs on your machine and upload through the live site during the pitch.

Script: `demo-documents/DEMO-WALKTHROUGH.md`.
