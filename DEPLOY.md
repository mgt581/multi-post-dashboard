# Deployment Guide for Multipost Worker

> 📌 **Looking for the redirect URIs?** See [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md) for a quick reference of all platform OAuth redirect URIs.

## Prerequisites

1. **Cloudflare Account** - Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI** - Install globally:
   ```bash
   npm install -g wrangler
   ```

## D1 Guides

Not sure what you can do with a D1 database? Learn from one of our helpful guides.

- **Deploy a REST API** — Learn how to deploy a new Worker that provides a CRUD-based REST API on top of your D1 database. Browse the D1 tutorials at [developers.cloudflare.com/d1/tutorials](https://developers.cloudflare.com/d1/tutorials/).

## Step 1: Login to Cloudflare

```bash
wrangler login
```

## Step 2: Create D1 Database

```bash
wrangler d1 create multipost-db
```

Copy the `database_id` from the output and update it in `wrangler.toml`:
```toml
database_id = "paste-your-database-id-here"
```

## Step 3: Initialize Database Schema

```bash
wrangler d1 execute multipost-db --file=./schema.sql
```

## Step 4: Set BASE_URL and OAuth Secrets

**IMPORTANT:** Set your BASE_URL and optionally FRONTEND_URL:

```bash
wrangler secret put BASE_URL
# Enter the worker URL: https://your-worker-name.workers.dev
# This is used for OAuth redirect URIs and MUST match what you configure in OAuth apps

# If your frontend (HTML files) is hosted separately (e.g., on GitHub Pages):
wrangler secret put FRONTEND_URL
# Enter: https://your-frontend-domain.com (e.g., https://multipostapp.co.uk)
# If not set, users will be redirected back to BASE_URL after authentication
```

**Deployment Scenarios:**
1. **All-in-one (Worker serves everything):** Only set BASE_URL to your worker URL
2. **Separate frontend:** Set BASE_URL to worker URL, FRONTEND_URL to where HTML files are hosted

Then set each OAuth secret using the following commands:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put TIKTOK_CLIENT_KEY
wrangler secret put TIKTOK_CLIENT_SECRET
wrangler secret put FB_CLIENT_ID
wrangler secret put FB_CLIENT_SECRET
```

### Getting OAuth Credentials

**CRITICAL:** Use your BASE_URL (worker URL) in the redirect URIs below. The redirect URIs **must match exactly** what you set in BASE_URL.

**⚠️ IMPORTANT:** The redirect URIs must use your **WORKER URL** (BASE_URL), NOT your frontend URL. The WORKER handles the OAuth callbacks, then redirects users to the FRONTEND.

**YouTube (Google OAuth):**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable YouTube Data API v3
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `YOUR_WORKER_URL/api/auth/callback/youtube`
   - Example: `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube`
   - **NOT** `https://multipostapp.co.uk/api/auth/callback/youtube`

**TikTok:**
1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Create an app
3. Add redirect URI: `YOUR_WORKER_URL/api/auth/callback/tiktok`
   - Example: `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok`
   - **NOT** `https://multipostapp.co.uk/api/auth/callback/tiktok`
   - **IMPORTANT:** TikTok requires an exact match - verify no trailing slash is added
   - The redirect URI must use HTTPS (HTTP and localhost are not accepted)

**Facebook:**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create an app
3. Add Facebook Login product
4. Add redirect URI: `YOUR_WORKER_URL/api/auth/callback/facebook`
   - Example: `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook`
   - **NOT** `https://multipostapp.co.uk/api/auth/callback/facebook`

## Step 5: Deploy Worker

```bash
wrangler deploy
```

## Step 6: Update Frontend URLs

After deployment, update the API base URL in these files:
- `index.html` (line 222)
- `create-post.html` (line 85)
- `folder.html` (line 37)

Replace `https://multipost-seo-worker.alexbryant.workers.dev/api` with your worker URL:
```javascript
const apiBase = "https://your-worker-name.workers.dev/api";
```

## Testing

Test your deployment:
```bash
curl https://your-worker-name.workers.dev/api/get-folders
```

## Updating the Worker

After making changes to `worker.js`, redeploy:
```bash
wrangler deploy
```

## Troubleshooting

### TikTok OAuth "redirect_uri" Error

If you see an error like "We couldn't log in with TikTok. This may be due to specific app settings. redirect_uri":

1. **Verify BASE_URL is set correctly:**
   ```bash
   wrangler secret list
   # BASE_URL should appear in the list
   ```

2. **Check the redirect URI in TikTok Developer Portal:**
   - Go to your app settings at [TikTok for Developers](https://developers.tiktok.com/)
   - Under "Redirect URI", ensure it exactly matches: `YOUR_BASE_URL/api/auth/callback/tiktok`
   - Example: `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok`
   - **NOT** `https://multipostapp.co.uk/api/auth/callback/tiktok` (that's the frontend URL)
   - **No trailing slash** after "tiktok"
   - **Must use HTTPS** (not HTTP)

3. **Common issues:**
   - BASE_URL set as `http://` instead of `https://`
   - BASE_URL includes a trailing slash (should be `https://domain.com` not `https://domain.com/`)
   - TikTok redirect URI doesn't match BASE_URL (case-sensitive, character-for-character match)
   - **Most common:** Using FRONTEND_URL instead of BASE_URL (worker URL) in OAuth app redirect URIs
   - Confusing BASE_URL (worker) with FRONTEND_URL (where HTML files are hosted)

4. **Test the OAuth flow:**
   - BASE_URL should be your worker URL (e.g., `https://multipost-seo-worker.alexbryant.workers.dev`)
   - FRONTEND_URL should be where your HTML files are hosted (e.g., `https://multipostapp.co.uk`)
   - OAuth redirect URIs in provider consoles MUST use BASE_URL (worker), not FRONTEND_URL
   - Users can access the app from FRONTEND_URL, but OAuth callbacks go to the worker (BASE_URL)

### Other OAuth Issues

**View logs:**
```bash
wrangler tail
```

**Test locally:**
```bash
wrangler dev
```

**Check database:**
```bash
wrangler d1 execute multipost-db --command="SELECT * FROM folders"
```
