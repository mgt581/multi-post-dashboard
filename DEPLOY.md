# Deployment Guide for Multipost Worker

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

## Step 4: Set OAuth Secrets

Set each secret using the following commands:

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put TIKTOK_CLIENT_KEY
wrangler secret put TIKTOK_CLIENT_SECRET
wrangler secret put FB_CLIENT_ID
wrangler secret put FB_CLIENT_SECRET
```

### Getting OAuth Credentials

**YouTube (Google OAuth):**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select the **`multipost-youtube-api`** project (project number `72559136598`).
   - **Do not** use the `multi-post-daefc` Firebase project for these credentials.
3. Enable **YouTube Data API v3** (APIs & Services → Library).
4. Open **APIs & Services → Credentials** and select (or create) the OAuth 2.0 Client ID.  
   The current client ID is:  
   `1099160429576-38kfvgqfgahc80oc11v1abl79n1gdspm.apps.googleusercontent.com`
5. Ensure the following authorized redirect URIs are added to the OAuth client:  
   - **Production**: `https://multipostapp.co.uk/api/auth/callback/youtube`  
   - **Local dev**: `http://localhost:8787/api/auth/callback/youtube`

**TikTok:**
1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Create an app
3. Add redirect URI: `https://your-worker.workers.dev/api/auth/callback/tiktok`

**Facebook:**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create an app
3. Add Facebook Login product
4. Add redirect URI: `https://your-worker.workers.dev/api/auth/callback/facebook`

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
