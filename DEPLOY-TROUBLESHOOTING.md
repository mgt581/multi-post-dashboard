# Deployment Troubleshooting

This document covers common deployment failures for the Multipost Cloudflare Worker
and how to recover from them.

---

## 1. Cloudflare GitHub Builds — "failed in 0s" / Build token deleted/rolled

### Symptom
The **Cloudflare Workers and Pages / Workers Builds: multipost-seo-worker** GitHub check
shows a red ✗ with a message similar to any of the following:

> _"The build token selected for this build has been deleted or rolled and cannot be used
> for this build. Please update your build token in the Worker Builds settings and retry
> the build."_

> _"Build token has been deleted or rotated. Please reauthorize the GitHub integration."_

or the build simply fails in 0–2 seconds with no meaningful log output.

This prevents Cloudflare from pulling new code from GitHub. The Cloudflare integration
loses its access token whenever the GitHub App authorisation is revoked or rotated.

### Fix
1. In the **Cloudflare dashboard**, go to **Workers & Pages → multipost-seo-worker →
   Settings → Builds** (may also appear as **Builds & Deployments** or **Git Integration**).
2. Under **Build token** (or **GitHub Integration**), click **Update build token** (or
   **Disconnect** / **Revoke**) next to the GitHub integration.
3. Re-authorise the GitHub app for your account/repo by clicking **Connect to Git** /
   **Authorize**.
4. Trigger a new deploy by pushing a commit or clicking **Retry build**.

> **Note:** While the Cloudflare GitHub integration is broken, the **GitHub Actions** workflow
> (`deploy.yml`) is the primary deployment mechanism and will continue to deploy the worker
> automatically on every push to `main`, as long as `CLOUDFLARE_API_TOKEN` and
> `CLOUDFLARE_ACCOUNT_ID` are set as repository secrets.

---

## 2. GitHub Actions deploy failing — missing Cloudflare secrets

### Symptom
The `.github/workflows/deploy.yml` workflow run shows `failure` in GitHub Actions.

### Fix
Ensure the following secrets are set in the repository's **Settings → Secrets and variables → Actions**:

| Secret name              | Where to get it |
|--------------------------|-----------------|
| `CLOUDFLARE_API_TOKEN`   | Cloudflare dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID`  | Cloudflare dashboard → right-hand sidebar |
| `GOOGLE_CLIENT_SECRET`   | Google Cloud Console → OAuth credentials |
| `TIKTOK_CLIENT_SECRET`   | TikTok for Developers → your app |
| `FB_CLIENT_SECRET`       | Meta for Developers → your app |
| `OPENAI_API_KEY`         | OpenAI platform → API keys |

---

## 3. Manual deploy (bypass GitHub Builds entirely)

If both the Cloudflare GitHub integration and GitHub Actions are broken, deploy directly
from your local machine:

```bash
# 1. Pull the latest code
git pull origin main

# 2. Install dependencies (only needed once, or after package.json changes)
npm install

# 3. Log in to Cloudflare (opens a browser window the first time)
npx wrangler login

# 4. Deploy to production
npm run deploy
```

Wrangler will print the deployed worker URL and route assignments when it succeeds.

---

## 4. Test the deployed worker

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
Run `npm run deploy` to push the current code.

---

## 5. View live worker logs

```bash
npx wrangler tail
```

---

## 6. TikTok sandbox mode + `access_token_invalid`

### Symptom
TikTok upload fails with:

`{"code":"access_token_invalid","message":"The access token is invalid or not found in the request."}`

### Why this happens
- The linked TikTok token is expired/invalid, or
- The token was created in a different TikTok app/environment than the one now used by the worker.

### Fix
1. Set TikTok environment base URLs in Worker vars:
   - `TIKTOK_AUTH_BASE_URL`
   - `TIKTOK_API_BASE_URL`
2. For production, use:
   - `https://www.tiktok.com`
   - `https://open.tiktokapis.com`
3. For sandbox/testing, set both vars to the sandbox hosts configured for your TikTok app in the developer portal.
4. After changing these vars, reconnect TikTok in-app (OAuth again) so a token is minted for that same environment.
5. Retry publish.

### Important if you use separate TikTok apps
If your TikTok sign-in app is different from your TikTok publishing app, configure separate Worker vars:

- Sign-in flow:
   - `TIKTOK_SIGNIN_CLIENT_KEY`
   - `TIKTOK_SIGNIN_CLIENT_SECRET`
- Connect/publish flow:
   - `TIKTOK_PUBLISH_CLIENT_KEY`
   - `TIKTOK_PUBLISH_CLIENT_SECRET`

If these are not set, the worker falls back to `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.
After changing client vars, re-link TikTok from inside the app so publish tokens are minted with the publish app credentials.

If you switch environment but keep an old token, TikTok will return `access_token_invalid`.

---

## 7. Test locally before deploying

```bash
npm run dev
# Worker is now available at http://localhost:8787
curl -si http://localhost:8787/api/health
```

---

## 8. Check the deployed version without curl

The `X-Worker-Version` header is returned on **every** API response.  
It matches the `WORKER_VERSION` constant at the top of `worker.js`.

Update `WORKER_VERSION` (e.g. to today's date or a git SHA) each time you deploy so you
can quickly confirm which code is running:

```bash
# After deploying, confirm the version matches what you just pushed:
curl -si https://multipostapp.co.uk/api/health | grep -i x-worker-version
```
