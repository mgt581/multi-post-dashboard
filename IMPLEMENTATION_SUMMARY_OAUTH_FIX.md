# OAuth redirect_uri_mismatch Fix - Implementation Summary

## Problem Statement

Users were encountering the following error when trying to authenticate with YouTube (Google OAuth):

```
Error 400: redirect_uri_mismatch

You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy.

Request details: redirect_uri=https://multipostapp.co.uk/api/auth/callback/youtube
```

## Root Cause Analysis

The error message reveals that the redirect URI being used was `https://multipostapp.co.uk/api/auth/callback/youtube`, which appears to be the **frontend URL** rather than the **Cloudflare Worker URL**.

### Why This Happens

The application architecture separates the frontend (HTML files) from the backend API (Cloudflare Worker):

- **Frontend**: Hosted on GitHub Pages at `https://multipostapp.co.uk`
- **Backend**: Cloudflare Worker at `https://multipost-seo-worker.alexbryant.workers.dev` (or similar)

The OAuth redirect URI **must** point to the Worker URL (backend) because:
1. OAuth requires server-side code to handle the authorization code exchange
2. Client secrets cannot be exposed in browser JavaScript
3. Tokens must be stored securely on the server side

### The Configuration Mistake

Users were likely setting `BASE_URL` to the frontend URL instead of the worker URL, or not setting it at all, causing the worker to auto-detect the wrong URL based on the incoming request hostname.

## Solution Implemented

### 1. Enhanced Validation in worker.js

Added `validateBaseUrl()` function that:
- Detects when `BASE_URL` is not set and warns users
- Checks if `BASE_URL` looks like a workers.dev URL
- Warns if BASE_URL might be a frontend URL instead of worker URL
- Provides actionable guidance in console logs

**Code location:** Lines 63-91 in worker.js

### 2. Enhanced /api/config-check Endpoint

Upgraded the configuration check endpoint to provide comprehensive diagnostics:

**Features:**
- Status indicator: `OK`, `CHECK_WARNINGS`, or `MISCONFIGURED`
- List of errors (critical issues that will cause failures)
- List of warnings (potential issues to review)
- Current redirect URIs being used for each platform
- Configuration of all secrets (boolean status only, not values)
- Help text with troubleshooting steps
- Links to documentation

**Usage:**
```bash
curl https://your-worker.workers.dev/api/config-check
```

**Example output:**
```json
{
  "status": "MISCONFIGURED",
  "baseUrl": "https://multipostapp.co.uk",
  "frontendUrl": "https://multipostapp.co.uk",
  "currentRequestHost": "multipostapp.co.uk",
  "isWorkersUrl": false,
  "redirectUris": {
    "youtube": "https://multipostapp.co.uk/api/auth/callback/youtube",
    "tiktok": "https://multipostapp.co.uk/api/auth/callback/tiktok",
    "facebook": "https://multipostapp.co.uk/api/auth/callback/facebook"
  },
  "secretsConfigured": {
    "BASE_URL": true,
    "FRONTEND_URL": false,
    "GOOGLE_CLIENT_ID": true,
    "GOOGLE_CLIENT_SECRET": true,
    ...
  },
  "errors": [
    {
      "severity": "WARNING",
      "message": "BASE_URL (https://multipostapp.co.uk) does not appear to be a workers.dev URL",
      "impact": "This could be correct if using a custom domain, OR incorrect if using frontend URL",
      "check": "Verify this is your Cloudflare Worker URL, NOT your frontend/GitHub Pages URL",
      "correctExample": "https://your-worker.workers.dev",
      "incorrectExample": "https://multipostapp.co.uk (use FRONTEND_URL for this instead)"
    }
  ],
  "warnings": [],
  "help": {
    "message": "Getting redirect_uri_mismatch errors?",
    "steps": [
      "1. Verify BASE_URL is set to your WORKER URL (not frontend URL)",
      "2. Check that redirect URIs above match EXACTLY what is in Google/TikTok/Meta consoles",
      "3. Ensure no trailing slashes in BASE_URL",
      "4. Use FRONTEND_URL for where users should be redirected after OAuth (optional)"
    ],
    "documentation": "See TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md for detailed troubleshooting"
  }
}
```

**Code location:** Lines 193-237 in worker.js

### 3. Comprehensive Troubleshooting Guide

Created `TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md` with:

**Contents:**
- Explanation of the error
- Root causes with symptoms
- Step-by-step solutions for each cause
- Diagnostic procedures
- Complete fix process
- Quick reference for correct configuration
- Common mistakes to avoid
- OAuth flow explanation
- Architecture rationale

**Sections:**
1. The Error Message
2. Root Cause
3. Common Causes & Solutions
   - BASE_URL set to frontend URL
   - BASE_URL not set at all
   - Trailing slash in BASE_URL
   - Redirect URI not registered in provider console
4. How to Diagnose
5. Step-by-Step Fix Process
6. Quick Reference
7. Still Having Issues? (common mistakes)
8. Understanding the OAuth Flow
9. Why This Architecture?

### 4. Updated README

Enhanced the README to:
- Feature troubleshooting guide prominently
- Add quick diagnosis command
- Highlight common mistakes
- Show correct vs incorrect configuration examples
- Link to new troubleshooting documentation

## Correct Configuration

### Environment Variables in Cloudflare Worker

```bash
# Required: Your Cloudflare Worker URL (NOT frontend URL)
wrangler secret put BASE_URL
# Enter: https://your-worker.workers.dev

# Optional: Your frontend URL (where HTML files are hosted)
wrangler secret put FRONTEND_URL
# Enter: https://multipostapp.co.uk

# Required: OAuth credentials
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
# ... etc
```

### OAuth Provider Redirect URIs

Register these in the OAuth provider consoles:

| Platform | Redirect URI | Console Location |
|----------|--------------|------------------|
| YouTube  | `https://your-worker.workers.dev/api/auth/callback/youtube` | Google Cloud Console → OAuth 2.0 credentials |
| TikTok   | `https://your-worker.workers.dev/api/auth/callback/tiktok` | TikTok for Developers → App Settings |
| Facebook | `https://your-worker.workers.dev/api/auth/callback/facebook` | Meta for Developers → Facebook Login Settings |

**Critical rules:**
- ✅ Use worker URL (e.g., `https://your-worker.workers.dev`)
- ❌ Never use frontend URL (e.g., `https://multipostapp.co.uk`)
- ✅ Use HTTPS (never HTTP)
- ✅ No trailing slashes
- ✅ Exact character match (case sensitive)

## How Users Should Fix the Issue

### Step 1: Check Current Configuration

```bash
curl https://your-worker.workers.dev/api/config-check
```

Look for:
- `"status": "MISCONFIGURED"` or warnings
- Whether `baseUrl` is your worker URL or frontend URL
- Any errors or warnings in the response

### Step 2: Set BASE_URL Correctly

```bash
# Find your worker URL
wrangler deploy
# Note the URL: https://your-worker.workers.dev

# Set BASE_URL to this worker URL
wrangler secret put BASE_URL
# Enter: https://your-worker.workers.dev (NO trailing slash!)
```

### Step 3: Set FRONTEND_URL (Optional)

If your frontend is hosted separately (GitHub Pages, custom domain):

```bash
wrangler secret put FRONTEND_URL
# Enter: https://multipostapp.co.uk
```

### Step 4: Update OAuth Provider Consoles

For each platform (YouTube, TikTok, Facebook), add the redirect URI shown in the `/api/config-check` response to the provider's console.

### Step 5: Verify and Test

```bash
# Verify configuration
curl https://your-worker.workers.dev/api/config-check
# Should show status: "OK"

# Test OAuth flow
# Visit your app and try linking a platform
```

## Files Changed

1. **worker.js**
   - Added `validateBaseUrl()` function (lines 63-91)
   - Enhanced `/api/config-check` endpoint (lines 193-237)
   - Added comprehensive validation warnings

2. **TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md** (new file)
   - Complete troubleshooting guide
   - 350+ lines of documentation
   - Step-by-step fixes for all common issues

3. **README.md**
   - Added prominent troubleshooting section at top
   - Added quick diagnosis command
   - Added correct configuration examples
   - Linked to new troubleshooting guide

## Testing

### Syntax Validation

```bash
node -c worker.js
# ✅ Passed: No syntax errors
```

### Function Presence

```bash
grep -q "validateBaseUrl" worker.js
# ✅ Passed: Validation function exists

grep -q "status:" worker.js
# ✅ Passed: Enhanced config-check has status field

grep -q "errors:" worker.js
# ✅ Passed: Enhanced config-check has errors array

grep -q "warnings:" worker.js
# ✅ Passed: Enhanced config-check has warnings array
```

### Documentation

```bash
ls -la TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md
# ✅ Passed: Troubleshooting guide exists

grep -q "TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md" README.md
# ✅ Passed: README links to troubleshooting guide
```

## Benefits of This Implementation

### 1. Proactive Detection
- Validates configuration at runtime
- Warns users immediately about potential issues
- Prevents silent failures

### 2. Self-Service Diagnostics
- Users can check their own configuration with `/api/config-check`
- Clear error messages explain what's wrong
- Actionable solutions provided

### 3. Comprehensive Documentation
- Single source of truth for troubleshooting
- Covers all common scenarios
- Step-by-step fix procedures
- Examples and explanations

### 4. Developer-Friendly
- Console logs show warnings during development
- Enhanced endpoint helps debug production issues
- Clear separation of concerns (BASE_URL vs FRONTEND_URL)

### 5. Prevention of Future Issues
- README prominently features troubleshooting
- Configuration mistakes are caught early
- Guidance is built into the code

## Next Steps for Users

1. **Read**: Start with `TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md`
2. **Check**: Run `/api/config-check` on your worker
3. **Fix**: Set `BASE_URL` to your worker URL
4. **Verify**: Check configuration shows `"status": "OK"`
5. **Test**: Try the OAuth flow with each platform

## Conclusion

This implementation provides:
- ✅ Detection of misconfiguration before it causes errors
- ✅ Clear diagnostic tools for users
- ✅ Comprehensive troubleshooting documentation
- ✅ Validation that guides users to correct setup
- ✅ Prevention of the most common OAuth configuration mistakes

The `redirect_uri_mismatch` error should now be much easier to diagnose and fix, with users having clear guidance on exactly what needs to be changed.
