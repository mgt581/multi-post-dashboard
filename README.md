# Multi-Post Dashboard

A cross-platform social media management tool built on Cloudflare Workers.

## ⚠️ Getting "redirect_uri_mismatch" Error?

**👉 [OAUTH_REDIRECT_URI_FIX.md](./OAUTH_REDIRECT_URI_FIX.md)** - Complete fix guide for OAuth errors

**Common issue:** You need to use your **worker URL** (not frontend URL) in OAuth provider redirect URIs.

## 📚 Documentation

- **[OAUTH_IMPLEMENTATION_SUMMARY.md](./OAUTH_IMPLEMENTATION_SUMMARY.md)** - Complete OAuth implementation details
- **[DEPLOY.md](./DEPLOY.md)** - Complete deployment guide
- **[OAUTH_FIX_README.md](./OAUTH_FIX_README.md)** - Detailed OAuth setup and troubleshooting
- **[REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md)** - Quick reference for all platform redirect URI paths

## Quick Start

### Platform OAuth Redirect URIs

**Need the redirect URIs for your OAuth apps?** 

👉 **[REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md)** - Quick reference for all platform redirect URI paths

## Platform Redirect URIs (Quick Reference)

All redirect URIs follow this pattern:
```
YOUR_BASE_URL/api/auth/callback/{platform}
```

- **YouTube:** `YOUR_BASE_URL/api/auth/callback/youtube`
- **TikTok:** `YOUR_BASE_URL/api/auth/callback/tiktok`
- **Facebook:** `YOUR_BASE_URL/api/auth/callback/facebook`

**Important:** Replace `YOUR_BASE_URL` with your **Cloudflare Worker URL** (e.g., `https://your-worker.workers.dev`), NOT your frontend URL.

See [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md) for full details and examples.

## Architecture

### Centralized API Configuration

All HTML files now use a centralized configuration (`config.js`) that automatically detects the correct API base URL. This ensures:
- ✅ No hardcoded URLs in HTML files
- ✅ Works across different deployment environments
- ✅ Prevents OAuth redirect URI mismatches

See [OAUTH_IMPLEMENTATION_SUMMARY.md](./OAUTH_IMPLEMENTATION_SUMMARY.md) for complete implementation details.