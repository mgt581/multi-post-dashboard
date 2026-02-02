# OAuth redirect_uri_mismatch - What Was Fixed

## The Problem

Users were experiencing this error when trying to link YouTube, TikTok, or Facebook accounts:

```
Error 400: redirect_uri_mismatch
Access blocked: This app's request is invalid
```

## The Root Cause

The **documentation** had incorrect examples showing the frontend URL (`https://multipostapp.co.uk`) instead of the worker URL (`https://multipost-seo-worker.alexbryant.workers.dev`) for OAuth redirect URIs.

This led users to configure their OAuth apps with the wrong redirect URIs, causing authentication to fail.

## What Was Fixed

### 1. Documentation Corrections

**Files Updated:**
- `DEPLOY.md` - Fixed all OAuth redirect URI examples
- `REDIRECT_URI_GUIDE.md` - Added clear BASE_URL vs FRONTEND_URL explanation
- `.env.example` - Clarified that BASE_URL must be the worker URL
- `README.md` - Added prominent error notice linking to fix guide

**Before (Incorrect):**
```
Redirect URI: https://multipostapp.co.uk/api/auth/callback/youtube
```

**After (Correct):**
```
Redirect URI: https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube
```

### 2. New Comprehensive Fix Guide

Created `OAUTH_REDIRECT_URI_FIX.md` with:
- Step-by-step troubleshooting instructions
- Clear explanation of BASE_URL vs FRONTEND_URL
- OAuth flow diagram
- Verification checklist
- Common mistakes to avoid
- Quick reference tables

## How to Fix Your Deployment

If you're experiencing the redirect_uri_mismatch error, follow these steps:

### Step 1: Verify Your Environment Variables

```bash
# Check what's currently set
wrangler secret list

# Set BASE_URL to your worker URL (REQUIRED)
wrangler secret put BASE_URL
# Enter: https://multipost-seo-worker.alexbryant.workers.dev

# Set FRONTEND_URL if hosting HTML separately (OPTIONAL)
wrangler secret put FRONTEND_URL
# Enter: https://multipostapp.co.uk
```

### Step 2: Update OAuth Redirect URIs in Provider Consoles

Use your **worker URL** (BASE_URL), not your frontend URL:

**YouTube (Google Cloud Console):**
```
https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube
```

**TikTok (TikTok for Developers):**
```
https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok
```

**Facebook (Meta for Developers):**
```
https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook
```

### Step 3: Test

1. Try linking a platform from your app
2. If you still get errors, check `wrangler tail` for debugging info
3. Verify the redirect URIs match exactly (no trailing slashes, HTTPS, case-sensitive)

## Key Concepts

### BASE_URL (Worker URL)
- **Purpose:** Handles API requests and OAuth callbacks
- **Example:** `https://multipost-seo-worker.alexbryant.workers.dev`
- **Used for:** OAuth redirect URIs in provider consoles

### FRONTEND_URL (Optional)
- **Purpose:** Where HTML files are hosted and users access the app
- **Example:** `https://multipostapp.co.uk` (GitHub Pages)
- **Used for:** Redirecting users after successful OAuth

### OAuth Flow

```
User on Frontend → Clicks "Link Platform" → Worker API initiates OAuth
   ↓
YouTube/TikTok/Facebook authorization page
   ↓
Provider redirects to WORKER callback URL ← (This must match redirect URI in OAuth app)
   ↓
Worker exchanges code for token and saves it
   ↓
Worker redirects user back to FRONTEND
```

## No Code Changes Were Needed

The worker.js implementation was already correct! It properly:
- Uses `env.BASE_URL` for OAuth redirect URIs
- Uses `env.FRONTEND_URL` (or falls back to BASE_URL) for user redirects
- Includes proper error handling and logging

The issue was purely **documentation** showing incorrect examples that led users to misconfigure their OAuth apps.

## Verification Checklist

After following the fix guide, verify:

- [ ] BASE_URL environment variable is set to worker URL
- [ ] FRONTEND_URL environment variable is set (if using separate frontend)
- [ ] Google OAuth redirect URI uses worker URL
- [ ] TikTok redirect URI uses worker URL
- [ ] Facebook redirect URI uses worker URL
- [ ] All redirect URIs use HTTPS
- [ ] No trailing slashes in redirect URIs
- [ ] Worker is deployed with `wrangler deploy`
- [ ] Can successfully link YouTube account
- [ ] Can successfully link TikTok account
- [ ] Can successfully link Facebook account

## Additional Resources

- **[OAUTH_REDIRECT_URI_FIX.md](./OAUTH_REDIRECT_URI_FIX.md)** - Complete troubleshooting guide
- **[REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md)** - Quick reference for redirect URIs
- **[DEPLOY.md](./DEPLOY.md)** - Full deployment instructions
- **[OAUTH_FIX_README.md](./OAUTH_FIX_README.md)** - OAuth implementation details

## Summary

✅ Documentation corrected with proper examples  
✅ Clear distinction between BASE_URL and FRONTEND_URL  
✅ Comprehensive troubleshooting guide created  
✅ Common mistakes highlighted  
✅ No code changes needed - worker implementation was correct

The fix is complete! Users should now be able to configure OAuth correctly by following the updated documentation.
