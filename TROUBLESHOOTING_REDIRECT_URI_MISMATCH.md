# Troubleshooting: redirect_uri_mismatch Error

## The Error Message

```
Error 400: redirect_uri_mismatch

You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy.

If you're the app developer, register the redirect URI in the Google Cloud Console.
Request details: redirect_uri=https://multipostapp.co.uk/api/auth/callback/youtube
```

## Root Cause

This error occurs when the `redirect_uri` used in the OAuth flow **does not exactly match** what's configured in the OAuth provider console (Google Cloud Console, TikTok Developer Portal, or Meta Developer Dashboard).

## Common Causes & Solutions

### ❌ Cause 1: BASE_URL is set to the frontend URL instead of the worker URL

**Problem:** You set `BASE_URL` to your frontend URL (e.g., `https://multipostapp.co.uk`) instead of your Cloudflare Worker URL.

**Symptoms:**
- Error shows: `redirect_uri=https://multipostapp.co.uk/api/auth/callback/youtube`
- Your frontend is hosted on GitHub Pages or a custom domain
- Your worker is at a different URL (e.g., `https://your-worker.workers.dev`)

**Solution:**
```bash
# CORRECT configuration:
wrangler secret put BASE_URL
# Enter: https://your-worker.workers.dev

wrangler secret put FRONTEND_URL
# Enter: https://multipostapp.co.uk
```

**Understanding BASE_URL vs FRONTEND_URL:**
- **BASE_URL**: Your Cloudflare Worker URL (where API endpoints are hosted)
  - Used for OAuth redirect URIs
  - Example: `https://multipost-seo-worker.alexbryant.workers.dev`
- **FRONTEND_URL**: Where your HTML files are hosted (optional)
  - Where users are redirected AFTER successful OAuth
  - Example: `https://multipostapp.co.uk`

### ❌ Cause 2: BASE_URL not set at all

**Problem:** The `BASE_URL` environment variable is not configured in your Cloudflare Worker.

**Symptoms:**
- Worker logs show: "BASE_URL environment variable not set!"
- OAuth might work or fail depending on where you access the app from

**Solution:**
```bash
# Find your worker URL first
wrangler deploy
# Output shows: Published multipost-seo-worker
#               https://your-worker.workers.dev

# Set BASE_URL to this worker URL
wrangler secret put BASE_URL
# Enter: https://your-worker.workers.dev (NO trailing slash!)
```

### ❌ Cause 3: Trailing slash in BASE_URL

**Problem:** BASE_URL has a trailing slash (e.g., `https://your-worker.workers.dev/`)

**Symptoms:**
- Error shows redirect_uri with double slashes: `https://your-worker.workers.dev//api/auth/callback/youtube`
- OAuth provider rejects the malformed URI

**Solution:**
```bash
# Remove the trailing slash
wrangler secret put BASE_URL
# ✅ Correct:   https://your-worker.workers.dev
# ❌ Incorrect: https://your-worker.workers.dev/
```

### ❌ Cause 4: Redirect URI not registered in OAuth provider console

**Problem:** The redirect URI is not added to the OAuth provider's allowed list.

**Solution for Google (YouTube):**

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   ```
   https://your-worker.workers.dev/api/auth/callback/youtube
   ```
4. Click "Save"
5. **Important:** Replace `your-worker.workers.dev` with your actual worker URL
6. **Important:** Match exactly - no trailing slashes, use HTTPS

**Solution for TikTok:**

1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Select your app → Settings
3. Add redirect URI:
   ```
   https://your-worker.workers.dev/api/auth/callback/tiktok
   ```
4. Save changes

**Solution for Facebook:**

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your app → Facebook Login → Settings
3. Add to "Valid OAuth Redirect URIs":
   ```
   https://your-worker.workers.dev/api/auth/callback/facebook
   ```
4. Save changes

## How to Diagnose

### Step 1: Check your configuration

Visit your worker's config check endpoint:
```
https://your-worker.workers.dev/api/config-check
```

This will show:
- What redirect URIs are being used
- Whether BASE_URL is configured
- Any configuration warnings or errors

### Step 2: Check worker logs

```bash
wrangler tail
```

Look for warning messages about BASE_URL configuration.

### Step 3: Verify the redirect URI in the error message

The error message shows the exact redirect URI being used:
```
redirect_uri=https://multipostapp.co.uk/api/auth/callback/youtube
```

**Ask yourself:**
1. Is this your worker URL or your frontend URL?
2. Does this match what's in your OAuth provider console?
3. Are there any trailing slashes or typos?

## Step-by-Step Fix Process

### 1. Identify your worker URL

```bash
wrangler whoami
wrangler deployments list
```

Or deploy and note the URL:
```bash
wrangler deploy
# Note the URL shown: https://your-worker.workers.dev
```

### 2. Set BASE_URL correctly

```bash
wrangler secret put BASE_URL
# Enter your worker URL (from step 1)
# Example: https://multipost-seo-worker.alexbryant.workers.dev
```

### 3. Set FRONTEND_URL (if frontend is separate)

```bash
wrangler secret put FRONTEND_URL
# Enter your frontend URL (GitHub Pages, custom domain, etc.)
# Example: https://multipostapp.co.uk
```

### 4. Update OAuth provider console

For **YouTube/Google**:
- Console: https://console.cloud.google.com/apis/credentials
- Add redirect URI: `https://your-worker.workers.dev/api/auth/callback/youtube`

For **TikTok**:
- Console: https://developers.tiktok.com/
- Add redirect URI: `https://your-worker.workers.dev/api/auth/callback/tiktok`

For **Facebook**:
- Console: https://developers.facebook.com/
- Add redirect URI: `https://your-worker.workers.dev/api/auth/callback/facebook`

### 5. Verify configuration

Visit: `https://your-worker.workers.dev/api/config-check`

Check that:
- `status` is "OK" or "CHECK_WARNINGS" (not "MISCONFIGURED")
- `baseUrl` matches your worker URL
- `redirectUris.youtube` matches what you added to Google Console
- `secretsConfigured.BASE_URL` is `true`

### 6. Test OAuth flow

1. Visit your frontend application
2. Create or select a folder
3. Click "Link YouTube" (or other platform)
4. You should be redirected to the OAuth provider
5. After approval, you should be redirected back successfully

## Quick Reference: Correct Configuration

### Environment Variables

```bash
# Required: Your Cloudflare Worker URL
BASE_URL=https://your-worker.workers.dev

# Optional: Your frontend URL (if different from worker)
FRONTEND_URL=https://multipostapp.co.uk

# Required: OAuth credentials
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
TIKTOK_CLIENT_KEY=your_tiktok_key
TIKTOK_CLIENT_SECRET=your_tiktok_secret
FB_CLIENT_ID=your_facebook_id
FB_CLIENT_SECRET=your_facebook_secret
```

### OAuth Provider Redirect URIs

| Platform | Redirect URI |
|----------|--------------|
| YouTube  | `https://your-worker.workers.dev/api/auth/callback/youtube` |
| TikTok   | `https://your-worker.workers.dev/api/auth/callback/tiktok` |
| Facebook | `https://your-worker.workers.dev/api/auth/callback/facebook` |

**Critical Rules:**
- ✅ Use your **worker URL**, not your frontend URL
- ✅ Use **HTTPS** (never HTTP)
- ✅ **No trailing slashes**
- ✅ **Exact match** - case sensitive for some providers
- ✅ Match **exactly** between code and provider console

## Still Having Issues?

### Check these common mistakes:

1. **Using HTTP instead of HTTPS**
   - ❌ `http://your-worker.workers.dev/api/auth/callback/youtube`
   - ✅ `https://your-worker.workers.dev/api/auth/callback/youtube`

2. **Wrong domain (frontend instead of worker)**
   - ❌ `https://multipostapp.co.uk/api/auth/callback/youtube`
   - ✅ `https://your-worker.workers.dev/api/auth/callback/youtube`

3. **Trailing slashes**
   - ❌ `https://your-worker.workers.dev/api/auth/callback/youtube/`
   - ✅ `https://your-worker.workers.dev/api/auth/callback/youtube`

4. **Typos in the path**
   - ❌ `https://your-worker.workers.dev/api/callback/youtube`
   - ✅ `https://your-worker.workers.dev/api/auth/callback/youtube`

5. **Case sensitivity**
   - ❌ `https://your-worker.workers.dev/api/auth/callback/YouTube`
   - ✅ `https://your-worker.workers.dev/api/auth/callback/youtube`

### Get more help:

- 📖 [OAUTH_REDIRECT_URI_FIX.md](./OAUTH_REDIRECT_URI_FIX.md) - Detailed OAuth architecture
- 📖 [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md) - Quick reference
- 📖 [DEPLOY.md](./DEPLOY.md) - Deployment guide
- 🔧 `/api/config-check` endpoint - Configuration diagnostics

## Understanding the OAuth Flow

```
1. User on Frontend (https://multipostapp.co.uk/folder.html)
   ↓ Clicks "Link YouTube"
   
2. Frontend calls: https://your-worker.workers.dev/api/auth/youtube
   ↓
   
3. Worker redirects to Google with redirect_uri parameter:
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id=...&
     redirect_uri=https://your-worker.workers.dev/api/auth/callback/youtube
   ↓
   
4. User approves on Google
   ↓
   
5. Google redirects to: https://your-worker.workers.dev/api/auth/callback/youtube?code=...
   ↓
   
6. Worker exchanges code for token using SAME redirect_uri
   ↓
   
7. Worker saves token and redirects user to:
   https://multipostapp.co.uk/folder.html?success=account_linked
```

**Key point:** Steps 3, 5, and 6 ALL use the worker URL (`your-worker.workers.dev`), NOT the frontend URL.

## Why This Architecture?

**Q: Why can't I just use my frontend URL for OAuth redirect URIs?**

**A:** OAuth requires the redirect URI to point to a server that can:
1. Receive the authorization code securely
2. Exchange it for an access token using the client secret
3. Store the token securely

Your frontend (browser JavaScript) cannot securely handle client secrets. The Cloudflare Worker acts as the secure backend for OAuth, so it must be the redirect URI target.

**Q: Where does my frontend URL come in?**

**A:** After the worker completes the OAuth flow, it redirects the user back to your frontend URL (FRONTEND_URL) so they can continue using the application.
