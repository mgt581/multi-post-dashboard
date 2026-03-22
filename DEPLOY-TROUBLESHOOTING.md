# Deployment Troubleshooting

This document covers common deployment failures for the Multipost Cloudflare Worker
and how to recover from them.

---

## 1. Cloudflare GitHub Builds — "Build token deleted/rolled" error

### Symptom
The Cloudflare dashboard shows a build failure similar to:

> _"Build token has been deleted or rotated. Please reauthorize the GitHub integration."_

This prevents Cloudflare from pulling new code from GitHub, so an **older version of the
Worker stays deployed** — which can cause the persistent 302 redirects you may be seeing
from `/api/*` endpoints.

### Fix
1. In the **Cloudflare dashboard**, go to **Workers & Pages → your Worker → Settings → Builds & Deployments**.
2. Click **Disconnect** (or **Revoke**) next to the GitHub integration.
3. Click **Connect to Git** again and re-authorise the GitHub app for your account/repo.
4. Trigger a new deploy by pushing a commit or clicking **Retry build**.

---

## 2. Manual deploy (bypass GitHub Builds entirely)

If the Cloudflare GitHub integration is broken, deploy directly from your local machine:

```bash
# 1. Pull the latest code
git pull origin main

# 2. Install dependencies (only needed once, or after package.json changes)
npm install

# 3. Log in to Cloudflare (opens a browser window the first time)
npx wrangler login

# 4. Deploy to production
npx wrangler deploy
```

Wrangler will print the deployed worker URL and route assignments when it succeeds.

---

## 3. Test the deployed worker

After deploying, confirm the correct version is live:

```bash
# Health check — should return HTTP 200 with JSON and X-Worker-Version header
curl -si https://multipostapp.co.uk/api/health

# Expected response (headers first, then body):
# HTTP/2 200
# content-type: application/json
# x-worker-version: 2026-03-21   ← matches WORKER_VERSION in worker.js
# ...
# {"ok":true,"service":"multipost-worker","version":"2026-03-21"}

# Unknown /api/* path — should return HTTP 404 JSON, NOT a 302 redirect
curl -si https://multipostapp.co.uk/api/does-not-exist
# HTTP/2 404
# {"success":false,"error":"Not found"}

# Non-API path — 302 redirect to the frontend is expected and correct
curl -si https://multipostapp.co.uk/
# HTTP/2 302
# location: https://multipostapp.co.uk
```

If `/api/health` returns **302**, the old worker version is still deployed.
Run `npx wrangler deploy` to push the current code.

---

## 4. View live worker logs

```bash
npx wrangler tail
```

---

## 5. Test locally before deploying

```bash
npx wrangler dev
# Worker is now available at http://localhost:8787
curl -si http://localhost:8787/api/health
```

---

## 6. Check the deployed version without curl

The `X-Worker-Version` header is returned on **every** API response.  
It matches the `WORKER_VERSION` constant at the top of `worker.js`.

Update `WORKER_VERSION` (e.g. to today's date or a git SHA) each time you deploy so you
can quickly confirm which code is running:

```bash
# After deploying, confirm the version matches what you just pushed:
curl -si https://multipostapp.co.uk/api/health | grep -i x-worker-version
```
