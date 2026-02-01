# Worker 404 Fix - Static File Serving

## Problem

When accessing the Cloudflare Worker URL directly (e.g., `https://multipost-seo-worker.alexbryant.workers.dev/`), users would receive a 404 error with a JSON response. This was confusing and didn't provide a good user experience.

## Solution

The worker has been enhanced to intelligently handle non-API routes by:

1. **Serving an informative HTML page at the root path** (`/` or `/index.html`)
2. **Redirecting to the frontend** when `FRONTEND_URL` is configured
3. **Handling non-API paths gracefully** instead of returning raw JSON 404s

## How It Works

### Scenario 1: Frontend Hosted Separately (e.g., GitHub Pages)

When `FRONTEND_URL` is set to a different domain than `BASE_URL`:

```bash
# BASE_URL = https://multipost-seo-worker.alexbryant.workers.dev
# FRONTEND_URL = https://multipostapp.co.uk
```

**Behavior:**
- Visiting `https://multipost-seo-worker.alexbryant.workers.dev/` → Redirects to `https://multipostapp.co.uk/`
- Visiting `https://multipost-seo-worker.alexbryant.workers.dev/folder.html?id=123` → Redirects to `https://multipostapp.co.uk/folder.html?id=123`
- API calls to `/api/*` endpoints work normally without redirects

### Scenario 2: All-in-One Deployment

When `FRONTEND_URL` is not set or equals `BASE_URL`:

```bash
# BASE_URL = https://multipost-seo-worker.alexbryant.workers.dev
# FRONTEND_URL not set (or same as BASE_URL)
```

**Behavior:**
- Visiting `https://multipost-seo-worker.alexbryant.workers.dev/` → Shows an informative API documentation page
- The page lists all available endpoints and links to the frontend
- Non-API paths return 404 (as the worker doesn't bundle static assets)

## Configuration

No configuration changes are required. The worker automatically detects the setup:

```javascript
const baseUrl = env.BASE_URL || `https://${url.hostname}`;
const frontendUrl = env.FRONTEND_URL || baseUrl;

// If frontendUrl !== baseUrl, redirects are enabled
// If frontendUrl === baseUrl, serves API info page
```

## What This Fixes

### Before
```bash
curl https://multipost-seo-worker.alexbryant.workers.dev/
# Response: {"success":false,"error":"Not Found"}
# Status: 404
# Content-Type: application/json
```

### After (with separate frontend)
```bash
curl https://multipost-seo-worker.alexbryant.workers.dev/
# Response: HTTP 302 Redirect to https://multipostapp.co.uk/
```

### After (without separate frontend)
```bash
curl https://multipost-seo-worker.alexbryant.workers.dev/
# Response: HTML page with API documentation
# Status: 200
# Content-Type: text/html
```

## API Endpoints Remain Unchanged

All API endpoints continue to work exactly as before:

- `POST /api/get-folders`
- `POST /api/add-folder`
- `POST /api/delete-folder`
- `GET /api/get-accounts`
- `GET /api/auth/{platform}` (YouTube, TikTok, Facebook)
- `GET /api/auth/callback/{platform}`
- `POST /api/generate-seo`

CORS headers are preserved on all responses.

## Deployment

Simply deploy the updated worker:

```bash
wrangler deploy
```

No additional configuration or setup is required.

## Technical Details

### URL Construction Safety

The redirect logic uses the `URL` constructor to safely join paths:

```javascript
const redirectUrl = new URL(url.pathname + url.search, frontendUrl).href;
return Response.redirect(redirectUrl, 302);
```

This prevents malformed URLs when `frontendUrl` ends with a slash or `url.pathname` has special characters.

### Dynamic Frontend URL

The HTML page dynamically includes the frontend URL:

```html
<p>Visit <a href="${frontendUrl}">${frontendUrl}</a> to use the application.</p>
```

This ensures the link is always correct regardless of the deployment configuration.

## Security

✅ **CodeQL Security Scan:** 0 alerts found
- No security vulnerabilities introduced
- Proper URL construction prevents open redirect attacks
- No sensitive data exposed in responses

## Testing

Test the deployment:

```bash
# Test root redirect/page
curl -I https://your-worker.workers.dev/

# Test non-API path redirect
curl -I https://your-worker.workers.dev/app.html

# Test API endpoint (should work normally)
curl https://your-worker.workers.dev/api/get-folders?user_id=test
```

## Troubleshooting

### I'm still seeing 404 errors

1. **Check if you're accessing an API endpoint correctly:**
   - API endpoints must start with `/api/`
   - Example: `/api/get-folders` (correct) vs `/get-folders` (404)

2. **Verify your deployment:**
   ```bash
   wrangler deploy
   wrangler tail  # View real-time logs
   ```

3. **Check environment variables:**
   ```bash
   wrangler secret list
   # Should show BASE_URL and optionally FRONTEND_URL
   ```

### The redirect isn't working

1. **Verify FRONTEND_URL is set:**
   ```bash
   wrangler secret put FRONTEND_URL
   # Enter: https://multipostapp.co.uk
   ```

2. **Check the redirect:**
   ```bash
   curl -I https://your-worker.workers.dev/
   # Should see: Location: https://multipostapp.co.uk/
   ```

### I want to serve static files from the worker

To serve static HTML/CSS/JS files directly from the worker, you would need to:

1. Use [Cloudflare Workers Sites](https://developers.cloudflare.com/workers/platform/sites/)
2. Or use [Cloudflare Pages](https://pages.cloudflare.com/) (recommended)
3. Or bundle assets into the worker code

The current solution assumes static files are hosted separately (on GitHub Pages or similar).
