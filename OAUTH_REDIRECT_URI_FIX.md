# OAuth Redirect URI Mismatch - Complete Fix Guide

## Problem

You're seeing the error:
```
Error 400: redirect_uri_mismatch
```

When trying to link YouTube, TikTok, or Facebook accounts to your application.

## Root Cause

The OAuth redirect URIs configured in your OAuth provider consoles (Google, TikTok, Facebook) do not match the redirect URIs your Cloudflare Worker is sending during the OAuth flow.

**Common mistake:** Using your **frontend URL** (e.g., `https://multipostapp.co.uk`) instead of your **worker URL** (e.g., `https://multipost-seo-worker.alexbryant.workers.dev`) in the OAuth redirect URIs.

## Solution

### Step 1: Identify Your URLs

You need to know two URLs:

1. **BASE_URL (Worker URL)** - Your Cloudflare Worker endpoint
   - Example: `https://multipost-seo-worker.alexbryant.workers.dev`
   - This handles API requests and OAuth callbacks
   - Find it by running `wrangler deploy` and noting the deployed URL

2. **FRONTEND_URL (Optional)** - Where your HTML files are hosted
   - Example: `https://multipostapp.co.uk` (if using GitHub Pages)
   - Where users access your application
   - If not set, users access via the worker URL

### Step 2: Set Environment Variables in Cloudflare

Set your BASE_URL secret (required):

```bash
wrangler secret put BASE_URL
# Enter your worker URL: https://multipost-seo-worker.alexbryant.workers.dev
```

Set your FRONTEND_URL secret (optional, only if HTML files are hosted separately):

```bash
wrangler secret put FRONTEND_URL
# Enter your frontend URL: https://multipostapp.co.uk
```

Verify secrets are set:

```bash
wrangler secret list
```

### Step 3: Configure OAuth Redirect URIs

**CRITICAL:** Use your **BASE_URL (worker URL)**, NOT your frontend URL!

#### YouTube (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your project → APIs & Services → Credentials
3. Click on your OAuth 2.0 Client ID
4. Under "Authorized redirect URIs", add:
   ```
   https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube
   ```
   Replace with YOUR worker URL (BASE_URL)
5. Click "Save"

#### TikTok (TikTok for Developers)

1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Navigate to your app → Settings
3. Under "Redirect URI", add:
   ```
   https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok
   ```
   Replace with YOUR worker URL (BASE_URL)
4. **Important:** No trailing slash! TikTok requires exact match
5. Must use HTTPS
6. Click "Save"

#### Facebook (Meta for Developers)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Navigate to your app → Facebook Login → Settings
3. Under "Valid OAuth Redirect URIs", add:
   ```
   https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook
   ```
   Replace with YOUR worker URL (BASE_URL)
4. Click "Save Changes"

### Step 4: Deploy Your Worker

```bash
wrangler deploy
```

### Step 5: Test the OAuth Flow

1. Access your application (via FRONTEND_URL or BASE_URL)
2. Navigate to a workspace/folder
3. Click "Link Now" on any platform
4. You should be redirected to the provider's authorization page
5. After approving, you should be redirected back to your app with the account linked

## Understanding the OAuth Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        OAuth Flow                                │
└─────────────────────────────────────────────────────────────────┘

1. User on Frontend (https://multipostapp.co.uk/folder.html)
   ↓
2. Clicks "Link Platform" → Calls Worker API
   GET https://multipost-seo-worker.alexbryant.workers.dev/api/auth/youtube
   ↓
3. Worker redirects to YouTube with redirect_uri parameter
   redirect_uri=https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube
   ↓
4. User authorizes on YouTube
   ↓
5. YouTube redirects to Worker callback URL
   https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube?code=xyz
   ↓
6. Worker exchanges code for access token
   ↓
7. Worker saves token to database
   ↓
8. Worker redirects user back to Frontend
   https://multipostapp.co.uk/folder.html?id=123&success=account_linked
```

**Key Point:** Steps 3 and 5 use the **WORKER URL** (BASE_URL), not the frontend URL. This is why OAuth redirect URIs in provider consoles must use the worker URL.

## Verification Checklist

- [ ] BASE_URL environment variable is set to your worker URL
- [ ] FRONTEND_URL environment variable is set (if using separate frontend)
- [ ] Google OAuth redirect URI uses worker URL: `{BASE_URL}/api/auth/callback/youtube`
- [ ] TikTok redirect URI uses worker URL: `{BASE_URL}/api/auth/callback/tiktok`
- [ ] Facebook redirect URI uses worker URL: `{BASE_URL}/api/auth/callback/facebook`
- [ ] No trailing slashes in redirect URIs
- [ ] All redirect URIs use HTTPS (not HTTP)
- [ ] Worker is deployed: `wrangler deploy`
- [ ] Tested linking each platform

## Troubleshooting

### Still getting redirect_uri_mismatch?

1. **Double-check the exact URLs:**
   - Run `wrangler secret list` to verify BASE_URL is set
   - Check browser developer console when clicking "Link Now"
   - Look for the redirect URI in the console logs

2. **Verify exact match:**
   - The redirect URI in the OAuth provider console must match EXACTLY (character-for-character) with what the worker sends
   - Case-sensitive
   - No extra spaces or trailing slashes
   - Must include `/api/auth/callback/{platform}`

3. **Common mistakes:**
   - ❌ Using `https://multipostapp.co.uk/api/auth/callback/youtube` (frontend URL)
   - ✅ Using `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube` (worker URL)
   
   - ❌ BASE_URL includes trailing slash: `https://worker.workers.dev/`
   - ✅ BASE_URL without trailing slash: `https://worker.workers.dev`
   
   - ❌ Redirect URI has trailing slash: `.../callback/tiktok/`
   - ✅ Redirect URI without trailing slash: `.../callback/tiktok`

### Check worker logs

```bash
wrangler tail
```

Then try linking a platform and watch for error messages.

### Test locally

```bash
wrangler dev
```

Note: OAuth providers may not allow localhost redirect URIs. You may need to use ngrok or similar tunneling service for local testing.

## Quick Reference

| Environment Variable | Example | Purpose |
|---------------------|---------|---------|
| BASE_URL | `https://multipost-seo-worker.alexbryant.workers.dev` | Worker URL for OAuth callbacks |
| FRONTEND_URL | `https://multipostapp.co.uk` | Where HTML files are hosted (optional) |

| Platform | Redirect URI Pattern | Example |
|----------|---------------------|---------|
| YouTube | `{BASE_URL}/api/auth/callback/youtube` | `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube` |
| TikTok | `{BASE_URL}/api/auth/callback/tiktok` | `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok` |
| Facebook | `{BASE_URL}/api/auth/callback/facebook` | `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook` |

## Need More Help?

- Review [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md) for quick reference
- Review [OAUTH_FIX_README.md](./OAUTH_FIX_README.md) for implementation details
- Review [DEPLOY.md](./DEPLOY.md) for full deployment instructions
- Check worker logs: `wrangler tail`
- Verify environment variables: `wrangler secret list`
