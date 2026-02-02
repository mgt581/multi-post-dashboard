# Platform OAuth Redirect URIs - Quick Reference

## What are the correct redirect URIs?

The redirect URIs for each platform follow this pattern:

```
YOUR_BASE_URL/api/auth/callback/{platform}
```

Where `YOUR_BASE_URL` is your Cloudflare Worker URL (e.g., `https://your-worker.workers.dev`)

## Platform-Specific Redirect URIs

Replace `YOUR_BASE_URL` with your actual worker URL:

### YouTube (Google OAuth)
```
YOUR_BASE_URL/api/auth/callback/youtube
```
**Example:** `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube`

**Where to set:** Google Cloud Console → OAuth 2.0 credentials → Authorized redirect URIs

### TikTok
```
YOUR_BASE_URL/api/auth/callback/tiktok
```
**Example:** `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok`

**Where to set:** TikTok for Developers → Your App → Settings → Redirect URI

⚠️ **Important:** TikTok requires exact match - no trailing slash, must use HTTPS

### Facebook
```
YOUR_BASE_URL/api/auth/callback/facebook
```
**Example:** `https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook`

**Where to set:** Meta for Developers → Your App → Facebook Login → Settings → Valid OAuth Redirect URIs

## How to Find Your BASE_URL

Your BASE_URL is your Cloudflare Worker URL. After deploying with `wrangler deploy`, you'll see it in the output:

```
Published multipost-worker
  https://your-worker.workers.dev
```

That URL is your `BASE_URL`.

## Configuration Checklist

- [ ] Deploy your worker with `wrangler deploy`
- [ ] Note your worker URL (this is your BASE_URL)
- [ ] Set the BASE_URL environment variable: `wrangler secret put BASE_URL`
- [ ] Add redirect URIs to each platform's developer console using the URLs above
- [ ] Ensure no trailing slashes
- [ ] Verify HTTPS is used (required)
- [ ] Test the OAuth flow

## Common Mistakes

❌ **Wrong:** Using your frontend URL (e.g., GitHub Pages URL)  
✅ **Correct:** Using your worker URL

❌ **Wrong:** `https://your-domain.com/api/auth/callback/youtube/`  
✅ **Correct:** `https://your-domain.com/api/auth/callback/youtube`

❌ **Wrong:** `http://your-domain.com/api/auth/callback/tiktok`  
✅ **Correct:** `https://your-domain.com/api/auth/callback/tiktok`

## Still Having Issues?

See [OAUTH_FIX_README.md](./OAUTH_FIX_README.md) for detailed troubleshooting and architecture information.
