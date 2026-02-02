# OAuth Redirect URI Fix - Setup Instructions

> 📌 **Quick Reference:** See [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md) for all platform OAuth redirect URIs at a glance.

## What Was Fixed

Your platform authentication was failing because:

1. **Facebook OAuth handler was completely missing** - The worker had no code to exchange Facebook authorization codes for access tokens
2. **Frontend redirect issue** - After OAuth, the worker was trying to redirect to its own URL instead of the frontend
3. **Poor error handling** - When OAuth failed, there were no helpful error messages

## Changes Made

### 1. Added Facebook OAuth Support
The worker now properly handles Facebook authentication with token exchange.

### 2. Added FRONTEND_URL Environment Variable
A new optional environment variable `FRONTEND_URL` allows you to specify where users should be redirected after successful OAuth. This is crucial if your HTML files are hosted separately from your worker (e.g., on GitHub Pages).

### 3. Enhanced Error Handling
- OAuth errors are now caught and displayed to users
- Console logging helps debug redirect URI mismatches
- Failed authentication redirects back to the folder page with error details

## How to Fix Your Deployment

### Step 1: Set BASE_URL (Required)

This should be your **worker URL** (where the API is hosted):

```bash
wrangler secret put BASE_URL
# Enter: https://multipost-seo-worker.alexbryant.workers.dev
```

### Step 2: Set FRONTEND_URL (If Applicable)

If your HTML files are hosted separately (e.g., on GitHub Pages at multipostapp.co.uk), set this:

```bash
wrangler secret put FRONTEND_URL
# Enter: https://multipostapp.co.uk
```

If you skip this step, users will be redirected back to the worker URL after OAuth, which won't work if the worker doesn't serve HTML files.

### Step 3: Configure OAuth Redirect URIs

In each platform's developer console, configure the redirect URIs using your **BASE_URL**:

#### YouTube (Google Cloud Console)
- Redirect URI: `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube`

#### TikTok (TikTok for Developers)
- Redirect URI: `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok`
- ⚠️ TikTok is strict about exact matches - no trailing slashes!

#### Facebook (Meta for Developers)
- Redirect URI: `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook`

### Step 4: Deploy the Updated Worker

```bash
wrangler deploy
```

## Testing

After deploying:

1. Go to the folders page
2. Try adding a platform account
3. If you get an error:
   - Check the browser's developer console for detailed error messages
   - Check the worker logs: `wrangler tail`
   - Verify the redirect URI in the OAuth app EXACTLY matches what's logged

## Common Issues

### "redirect_uri_mismatch" error
- The BASE_URL doesn't match what's configured in the OAuth app
- Solution: Double-check both values are identical

### "token_exchange_failed" error
- The OAuth credentials (client ID/secret) may be wrong
- The redirect URI might not match
- Solution: Verify all secrets are set correctly: `wrangler secret list`

### User is redirected to worker URL and gets 404
- FRONTEND_URL is not set
- Solution: Set FRONTEND_URL to where your HTML files are hosted

## Architecture

```
User Browser (multipostapp.co.uk)
    ↓ Click "Link Platform"
Worker API (multipost-seo-worker.alexbryant.workers.dev/api/auth/youtube)
    ↓ Redirect to YouTube
YouTube OAuth
    ↓ User approves
Worker Callback (multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube)
    ↓ Exchange code for token
    ↓ Save to database
Frontend (multipostapp.co.uk/folder.html) ← User ends up here
```

The key is that OAuth redirect URIs point to the **worker**, but final user redirect goes to the **frontend**.
