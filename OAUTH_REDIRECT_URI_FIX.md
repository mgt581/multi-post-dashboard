# OAuth Redirect URI Mismatch - Complete Fix Guide

## Problem

You're seeing the error:
```
Error 400: redirect_uri_mismatch
```

When trying to link YouTube, TikTok, or Facebook accounts to your application.

## Root Cause

The OAuth redirect URIs configured in your OAuth provider consoles (Google, TikTok, Facebook) do not match the redirect URIs your Cloudflare Worker is sending during the OAuth flow.

**Common mistakes:**
1. Using your **frontend URL** instead of your **worker URL** in OAuth redirect URIs
2. Including a **trailing slash** in the BASE_URL environment variable
3. Inconsistent URL format between authorization request and token exchange

## Canonical Format

**CRITICAL RULE: NO TRAILING SLASHES**

✅ **Correct canonical format:**
```
https://multipost-seo-worker.alexbryant.work
```

❌ **Incorrect (has trailing slash):**
```
https://multipost-seo-worker.alexbryant.work/
```

The redirect URIs constructed from BASE_URL are:
- YouTube:  `{BASE_URL}/api/auth/callback/youtube`
- TikTok:   `{BASE_URL}/api/auth/callback/tiktok`
- Facebook: `{BASE_URL}/api/auth/callback/facebook`

## Solution

### Step 1: Identify Your URLs

You need to know two URLs:

1. **BASE_URL (Worker URL)** - Your Cloudflare Worker endpoint
   - Example: `https://multipost-seo-worker.alexbryant.work`
   - This handles API requests and OAuth callbacks
   - Find it by running `wrangler deploy` and noting the deployed URL
   - **MUST NOT have a trailing slash**

2. **FRONTEND_URL (Optional)** - Where your HTML files are hosted
   - Example: `https://multipostapp.co.uk` (if using GitHub Pages)
   - Where users access your application
   - If not set, users access via the worker URL
   - **MUST NOT have a trailing slash**

### Step 2: Set Environment Variables in Cloudflare

Set your BASE_URL secret (required):

```bash
wrangler secret put BASE_URL
# Enter your worker URL WITHOUT trailing slash:
# ✅ Correct:   https://multipost-seo-worker.alexbryant.work
# ❌ Incorrect: https://multipost-seo-worker.alexbryant.work/
```

Set your FRONTEND_URL secret (optional, only if HTML files are hosted separately):

```bash
wrangler secret put FRONTEND_URL
# Enter your frontend URL WITHOUT trailing slash:
# ✅ Correct:   https://multipostapp.co.uk
# ❌ Incorrect: https://multipostapp.co.uk/
```

Verify secrets are set:

```bash
wrangler secret list
```

### Step 3: Configure OAuth Redirect URIs

**CRITICAL:** Use your **BASE_URL (worker URL)**, NOT your frontend URL!
**NO TRAILING SLASHES ALLOWED!**

#### YouTube (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to your project → APIs & Services → Credentials
3. Click on your OAuth 2.0 Client ID
4. Under "Authorized redirect URIs", add:
   ```
   https://multipost-seo-worker.alexbryant.work/api/auth/callback/youtube
   ```
   **Replace with YOUR worker URL (BASE_URL)**
   
   ✅ **Correct:**   `https://your-worker.workers.dev/api/auth/callback/youtube`
   ❌ **Incorrect:** `https://your-worker.workers.dev/api/auth/callback/youtube/`
5. Click "Save"

#### TikTok (TikTok for Developers)

1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Navigate to your app → Settings
3. Under "Redirect URI", add:
   ```
   https://multipost-seo-worker.alexbryant.work/api/auth/callback/tiktok
   ```
   **Replace with YOUR worker URL (BASE_URL)**
   
   ✅ **Correct:**   `https://your-worker.workers.dev/api/auth/callback/tiktok`
   ❌ **Incorrect:** `https://your-worker.workers.dev/api/auth/callback/tiktok/`
4. **CRITICAL:** No trailing slash! TikTok requires exact match
5. Must use HTTPS
6. Click "Save"

#### Facebook (Meta for Developers)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Navigate to your app → Facebook Login → Settings
3. Under "Valid OAuth Redirect URIs", add:
   ```
   https://multipost-seo-worker.alexbryant.work/api/auth/callback/facebook
   ```
   **Replace with YOUR worker URL (BASE_URL)**
   
   ✅ **Correct:**   `https://your-worker.workers.dev/api/auth/callback/facebook`
   ❌ **Incorrect:** `https://your-worker.workers.dev/api/auth/callback/facebook/`
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

- [ ] BASE_URL environment variable is set to your worker URL **WITHOUT trailing slash**
- [ ] FRONTEND_URL environment variable is set (if using separate frontend) **WITHOUT trailing slash**
- [ ] Google OAuth redirect URI uses worker URL: `{BASE_URL}/api/auth/callback/youtube`
- [ ] TikTok redirect URI uses worker URL: `{BASE_URL}/api/auth/callback/tiktok`
- [ ] Facebook redirect URI uses worker URL: `{BASE_URL}/api/auth/callback/facebook`
- [ ] **CRITICAL:** No trailing slashes in BASE_URL or redirect URIs
- [ ] All redirect URIs use HTTPS (not HTTP)
- [ ] Worker is deployed: `wrangler deploy`
- [ ] Tested linking each platform
- [ ] Worker logs show "✓ No trailing slash: true" for all OAuth flows

## Troubleshooting

### Still getting redirect_uri_mismatch?

1. **Check for trailing slash issues:**
   - Run `wrangler tail` and watch the logs when initiating OAuth
   - Look for warning: "⚠️  TRAILING SLASH DETECTED"
   - If you see this warning, update your BASE_URL secret without the trailing slash
   - Verify logs show: "✓ No trailing slash: true"

2. **Double-check the exact URLs:**
   - Run `wrangler secret list` to verify BASE_URL is set
   - Check browser developer console when clicking "Link Now"
   - Look for the redirect URI in the console logs
   - Verify the redirect URI in initiation matches the one in callback

3. **Verify exact match:**
   - The redirect URI in the OAuth provider console must match EXACTLY (character-for-character) with what the worker sends
   - Case-sensitive
   - No extra spaces or trailing slashes
   - Must include `/api/auth/callback/{platform}`

4. **Common mistakes:**
   - ❌ Using `https://multipostapp.co.uk/api/auth/callback/youtube` (frontend URL)
   - ✅ Using `https://multipost-seo-worker.alexbryant.work/api/auth/callback/youtube` (worker URL)
   
   - ❌ BASE_URL includes trailing slash: `https://worker.workers.dev/`
   - ✅ BASE_URL without trailing slash: `https://worker.workers.dev`
   
   - ❌ Redirect URI has trailing slash: `.../callback/tiktok/`
   - ✅ Redirect URI without trailing slash: `.../callback/tiktok`
   
   - ❌ Double slash from concatenation: `https://worker.workers.dev//api/auth/callback/youtube`
   - ✅ Single slash: `https://worker.workers.dev/api/auth/callback/youtube`

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

### Canonical Format (NO TRAILING SLASHES)

| Environment Variable | ✅ Correct Format | ❌ Incorrect Format |
|---------------------|-------------------|---------------------|
| BASE_URL | `https://multipost-seo-worker.alexbryant.work` | `https://multipost-seo-worker.alexbryant.work/` |
| FRONTEND_URL | `https://multipostapp.co.uk` | `https://multipostapp.co.uk/` |

### Platform Redirect URIs

| Platform | Redirect URI Pattern | Example |
|----------|---------------------|---------|
| YouTube | `{BASE_URL}/api/auth/callback/youtube` | `https://multipost-seo-worker.alexbryant.work/api/auth/callback/youtube` |
| TikTok | `{BASE_URL}/api/auth/callback/tiktok` | `https://multipost-seo-worker.alexbryant.work/api/auth/callback/tiktok` |
| Facebook | `{BASE_URL}/api/auth/callback/facebook` | `https://multipost-seo-worker.alexbryant.work/api/auth/callback/facebook` |

**Key Points:**
- BASE_URL must NOT have trailing slash
- Redirect URIs constructed automatically by worker
- All three platforms use the same pattern: `{BASE_URL}/api/auth/callback/{platform}`
- Worker automatically validates and normalizes URLs to prevent trailing slash issues

## Need More Help?

- Review [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md) for quick reference
- Review [OAUTH_FIX_README.md](./OAUTH_FIX_README.md) for implementation details
- Review [DEPLOY.md](./DEPLOY.md) for full deployment instructions
- Check worker logs: `wrangler tail`
- Verify environment variables: `wrangler secret list`
