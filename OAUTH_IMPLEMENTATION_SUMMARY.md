# OAuth Redirect URI Implementation Summary

## Overview
This document describes the OAuth redirect URI implementation and how it ensures zero redirect URI mismatches across all platforms (YouTube, TikTok, Facebook).

## Canonical Redirect URI Format

All OAuth redirect URIs follow this canonical format:

```
https://<BASE_URL>/api/auth/callback/{platform}
```

Where:
- `<BASE_URL>` is your Cloudflare Worker URL (e.g., `https://multipost-seo-worker.alexbryant.workers.dev`)
- `{platform}` is one of: `youtube`, `tiktok`, `facebook`

### Platform-Specific URIs

| Platform | Redirect URI Pattern | Example |
|----------|---------------------|---------|
| YouTube | `{BASE_URL}/api/auth/callback/youtube` | `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube` |
| TikTok | `{BASE_URL}/api/auth/callback/tiktok` | `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok` |
| Facebook | `{BASE_URL}/api/auth/callback/facebook` | `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook` |

## Implementation Architecture

### 1. Centralized API Configuration (`config.js`)

**Purpose:** Eliminates hardcoded API URLs across all HTML files.

**Location:** `/config.js`

**How it works:**
- Auto-detects the API base URL based on deployment context
- Supports multiple deployment scenarios (workers.dev, custom domains, GitHub Pages)
- Exports `API_BASE` constant for use in all pages

**Detection Logic:**
1. Check for `API_BASE_URL` environment variable (if injected during build)
2. Auto-detect if running on workers.dev domain
3. Fall back to default production worker URL

**Usage in HTML files:**
```html
<!-- Load centralized config -->
<script src="config.js"></script>

<script>
  const apiBase = API_BASE; // Use centralized API_BASE
  // ... rest of your code
</script>
```

### 2. Worker OAuth Implementation (`worker.js`)

**Lines 15-19:** Environment variable resolution
```javascript
const baseUrl = env.BASE_URL || `https://${url.hostname}`;
const frontendUrl = env.FRONTEND_URL || baseUrl;
```

**Lines 74-93:** OAuth initiation with dynamic redirect URI
```javascript
const redirect = `${baseUrl}/api/auth/callback/${platform}`;
// Passed to OAuth provider as redirect_uri parameter
```

**Lines 96-121:** OAuth callback handling with consistent URI
```javascript
const callbackUri = `${baseUrl}/api/auth/callback/${platform}`;
// Used for token exchange (must match the initiation URI)
```

**Key Implementation Points:**
- ✅ Single source of truth: `baseUrl` variable
- ✅ Used consistently in both auth initiation and callback
- ✅ Logged for debugging purposes
- ✅ Fallback mechanism if `BASE_URL` not set

### 3. HTML Files Integration

**Updated Files:**
- `folder.html` - Platform linking page (lines 63-66)
- `app.html` - Main application page (lines 52-56)
- `create-post.html` - Post creation page (lines 263-266)

**Before (Hardcoded):**
```javascript
const apiBase = "https://multipost-seo-worker.alexbryant.workers.dev/api";
```

**After (Centralized):**
```html
<script src="config.js"></script>
<script>
  const apiBase = API_BASE;
</script>
```

## OAuth Flow

### Complete OAuth Flow Diagram

```
1. User visits frontend
   ↓ (e.g., https://multipostapp.co.uk/folder.html)
   
2. User clicks "Link Platform"
   ↓ (JavaScript: window.location.href = `${API_BASE}/auth/{platform}`)
   
3. Frontend redirects to Worker API
   ↓ (e.g., https://multipost-seo-worker.alexbryant.workers.dev/api/auth/youtube)
   
4. Worker generates OAuth URL with redirect_uri
   ↓ (redirect_uri = https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube)
   
5. Worker redirects to OAuth Provider (Google/TikTok/Meta)
   ↓ (User authenticates)
   
6. Provider redirects to Worker callback
   ↓ (https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube?code=xyz)
   
7. Worker exchanges code for token
   ↓ (Uses same redirect_uri in token exchange request)
   
8. Worker saves token to database
   ↓
   
9. Worker redirects to frontend
   ↓ (https://multipostapp.co.uk/folder.html?id=123&success=account_linked)
   
10. User sees success message
```

### Critical Points

**Why BASE_URL must be the Worker URL:**
- OAuth providers (Google, TikTok, Meta) redirect to `BASE_URL/api/auth/callback/{platform}`
- The Worker handles this callback (not the frontend)
- The Worker must be accessible at this URL to exchange the authorization code for tokens

**Why redirect_uri must match exactly:**
- OAuth providers validate that the redirect_uri in token exchange matches the one from authorization
- Even a single character difference (trailing slash, http vs https, case) causes failure
- This implementation ensures both uses of redirect_uri are identical (same variable)

## Deployment Configuration

### Required Environment Variables

Set these using `wrangler secret put <NAME>`:

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `BASE_URL` | Yes | Worker URL for OAuth callbacks | `https://multipost-seo-worker.alexbryant.workers.dev` |
| `FRONTEND_URL` | Optional | Where to redirect users after OAuth | `https://multipostapp.co.uk` |
| `GOOGLE_CLIENT_ID` | Yes | YouTube OAuth credentials | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | YouTube OAuth credentials | From Google Cloud Console |
| `TIKTOK_CLIENT_KEY` | Yes | TikTok OAuth credentials | From TikTok Developer Portal |
| `TIKTOK_CLIENT_SECRET` | Yes | TikTok OAuth credentials | From TikTok Developer Portal |
| `FB_CLIENT_ID` | Yes | Facebook OAuth credentials | From Meta Developer Dashboard |
| `FB_CLIENT_SECRET` | Yes | Facebook OAuth credentials | From Meta Developer Dashboard |

### Setting Secrets

```bash
# Deploy the worker first to get the URL
wrangler deploy

# Set BASE_URL to your worker URL
wrangler secret put BASE_URL
# Enter: https://your-worker.workers.dev

# Set FRONTEND_URL if hosting HTML files separately
wrangler secret put FRONTEND_URL
# Enter: https://your-domain.com

# Set OAuth credentials
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put TIKTOK_CLIENT_KEY
wrangler secret put TIKTOK_CLIENT_SECRET
wrangler secret put FB_CLIENT_ID
wrangler secret put FB_CLIENT_SECRET
```

### Verifying Configuration

```bash
# List all set secrets
wrangler secret list

# Expected output should include:
# - BASE_URL
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - TIKTOK_CLIENT_KEY
# - TIKTOK_CLIENT_SECRET
# - FB_CLIENT_ID
# - FB_CLIENT_SECRET
# - (optionally) FRONTEND_URL
```

## Platform OAuth Console Configuration

### Google Cloud Console (YouTube)

1. Navigate to: https://console.cloud.google.com/apis/credentials
2. Select your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   ```
   https://your-worker.workers.dev/api/auth/callback/youtube
   ```
4. **Important:** No trailing slash, must use HTTPS, must match BASE_URL exactly

### TikTok Developer Portal

1. Navigate to: https://developers.tiktok.com/
2. Select your app → Settings
3. Under "Redirect URI", add:
   ```
   https://your-worker.workers.dev/api/auth/callback/tiktok
   ```
4. **Important:** TikTok is case-sensitive and requires exact match

### Meta Developer Dashboard (Facebook)

1. Navigate to: https://developers.facebook.com/apps/
2. Select your app → Facebook Login → Settings
3. Under "Valid OAuth Redirect URIs", add:
   ```
   https://your-worker.workers.dev/api/auth/callback/facebook
   ```
4. **Important:** Must use HTTPS, no trailing slash

## Common Issues and Solutions

### Issue: redirect_uri_mismatch

**Cause:** Redirect URI in code doesn't match what's registered in OAuth provider console

**Solution:**
1. Verify `BASE_URL` environment variable: `wrangler secret list`
2. Check OAuth provider console for exact URI
3. Ensure no trailing slashes
4. Verify HTTPS (not HTTP)
5. Check for typos or case differences

### Issue: OAuth works locally but not in production

**Cause:** BASE_URL environment variable not set or set incorrectly

**Solution:**
```bash
wrangler secret put BASE_URL
# Enter your production worker URL exactly
```

### Issue: Frontend can't reach API

**Cause:** Hardcoded URL in HTML files or config.js pointing to wrong environment

**Solution:**
- Check `config.js` - ensure the default URL is correct
- For GitHub Pages or separate hosting, verify CORS is enabled in worker.js
- Check browser console for API errors

## Protection Against Future Breakage

### 1. Centralized Configuration
- ✅ All API URLs defined in one place (`config.js`)
- ✅ No hardcoded URLs in HTML files
- ✅ Easy to update for new environments

### 2. Consistent Redirect URI Construction
- ✅ Single `baseUrl` variable in worker.js
- ✅ Same construction logic for auth and callback
- ✅ Logging for debugging

### 3. Environment Variable Validation
- ✅ Fallback mechanisms if BASE_URL not set
- ✅ Console logging for debugging
- ✅ Clear documentation of required variables

### 4. Documentation
- ✅ Comprehensive setup guides (DEPLOY.md, OAUTH_FIX_README.md)
- ✅ Quick reference guide (REDIRECT_URI_GUIDE.md)
- ✅ This implementation summary

## Testing OAuth Flow

### Manual Testing Checklist

For each platform (YouTube, TikTok, Facebook):

- [ ] Navigate to folder.html
- [ ] Click "Link Now" for the platform
- [ ] Verify redirect to correct OAuth provider
- [ ] Complete OAuth authorization
- [ ] Verify redirect back to folder.html with success message
- [ ] Confirm account appears as "Connected"
- [ ] Check browser console for any errors
- [ ] Verify no redirect_uri_mismatch errors

### Expected Console Output

```javascript
// When clicking "Link Now"
API Configuration: {
  baseUrl: "https://multipost-seo-worker.alexbryant.workers.dev/api",
  hostname: "multipostapp.co.uk",
  protocol: "https:"
}

// In worker logs (Cloudflare dashboard → Workers → Logs)
Initiating OAuth for youtube with redirect URI: https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube
BASE_URL env: https://multipost-seo-worker.alexbryant.workers.dev, Using: https://multipost-seo-worker.alexbryant.workers.dev
OAuth callback for youtube, callbackUri: https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube, has code: true, error: none
Successfully authenticated youtube for folder 123
```

## Conclusion

This implementation ensures:
- ✅ **Zero redirect URI mismatches** - consistent URI construction across all code paths
- ✅ **Portability** - works across different deployment environments
- ✅ **Maintainability** - centralized configuration, no hardcoded values
- ✅ **Reliability** - fallback mechanisms and comprehensive logging
- ✅ **Documentation** - clear guides for setup and troubleshooting

The OAuth flow is now production-ready for YouTube, TikTok, and Facebook with proper redirect URI handling.
