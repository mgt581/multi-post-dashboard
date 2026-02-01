# Multi-Post Dashboard

A cross-platform social media management tool built on Cloudflare Workers.

## Quick Start

### Platform OAuth Redirect URIs

**Need the redirect URIs for your OAuth apps?** 

👉 **[REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md)** - Quick reference for all platform redirect URI paths

### Deployment

📖 **[DEPLOY.md](./DEPLOY.md)** - Complete deployment guide

### OAuth Configuration

🔧 **[OAUTH_FIX_README.md](./OAUTH_FIX_README.md)** - Detailed OAuth setup and troubleshooting

## Platform Redirect URIs (Quick Reference)

All redirect URIs follow this pattern:
```
YOUR_BASE_URL/api/auth/callback/{platform}
```

- **YouTube:** `YOUR_BASE_URL/api/auth/callback/youtube`
- **TikTok:** `YOUR_BASE_URL/api/auth/callback/tiktok`
- **Facebook:** `YOUR_BASE_URL/api/auth/callback/facebook`

Replace `YOUR_BASE_URL` with your Cloudflare Worker URL.

See [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md) for full details and examples.