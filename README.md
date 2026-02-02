# Multi-Post Dashboard

A cross-platform social media management tool built on Cloudflare Workers.

## ⚠️ Getting "redirect_uri_mismatch" Error?

### 🔴 CRITICAL: BASE_URL must be your WORKER URL, not your frontend URL!

**🚀 Quick Fix (5 min):** [QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md) - **Start here!**

**📖 Detailed Troubleshooting:** [TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md](./TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md)

**Quick diagnosis:**
```bash
# Check your current configuration via command line
curl https://your-worker.workers.dev/api/config-check

# OR use the visual configuration checker
# Open oauth-config-checker.html in your browser
```

**🔧 [oauth-config-checker.html](./oauth-config-checker.html)** - Visual tool to check your OAuth configuration

**Common mistakes:**
1. ❌ Setting `BASE_URL` to frontend URL (e.g., `https://multipostapp.co.uk`)
   - ✅ **Fix:** `BASE_URL` should be your worker URL (e.g., `https://your-worker.workers.dev`)
2. ❌ Not setting `BASE_URL` at all
   - ✅ **Fix:** Run `wrangler secret put BASE_URL` with your worker URL
3. ❌ Trailing slash in BASE_URL
   - ✅ **Fix:** Remove trailing slash - use `https://your-worker.workers.dev` not `https://your-worker.workers.dev/`

**Correct configuration:**
```bash
# BASE_URL = Your Cloudflare Worker URL (required for OAuth)
wrangler secret put BASE_URL
# Enter: https://your-worker.workers.dev

# FRONTEND_URL = Where your HTML files are hosted (optional)
wrangler secret put FRONTEND_URL
# Enter: https://multipostapp.co.uk
```

## 📚 Documentation

- **[TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md](./TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md)** - 🆕 **Comprehensive troubleshooting guide**
- **[OAUTH_REDIRECT_URI_FIX.md](./OAUTH_REDIRECT_URI_FIX.md)** - Complete fix guide for OAuth errors
- **[OAUTH_IMPLEMENTATION_SUMMARY.md](./OAUTH_IMPLEMENTATION_SUMMARY.md)** - Complete OAuth implementation details
- **[DEPLOY.md](./DEPLOY.md)** - Complete deployment guide
- **[OAUTH_FIX_README.md](./OAUTH_FIX_README.md)** - Detailed OAuth setup and troubleshooting
- **[REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md)** - Quick reference for all platform redirect URI paths

## Quick Start

### Platform OAuth Redirect URIs

**Need the redirect URIs for your OAuth apps?** 

👉 **[REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md)** - Quick reference for all platform redirect URI paths

## Platform Redirect URIs (Quick Reference)

**CRITICAL: NO TRAILING SLASHES**

All redirect URIs follow this pattern:
```
YOUR_BASE_URL/api/auth/callback/{platform}
```

- **YouTube:** `YOUR_BASE_URL/api/auth/callback/youtube`
- **TikTok:** `YOUR_BASE_URL/api/auth/callback/tiktok`
- **Facebook:** `YOUR_BASE_URL/api/auth/callback/facebook`

**Important:** 
- Replace `YOUR_BASE_URL` with your **Cloudflare Worker URL** (e.g., `https://your-worker.workers.dev`), NOT your frontend URL
- **DO NOT include a trailing slash** in your BASE_URL
  - ✅ Correct: `https://your-worker.workers.dev`
  - ❌ Incorrect: `https://your-worker.workers.dev/`

See [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md) for full details and examples.

## Architecture

### Centralized API Configuration

All HTML files now use a centralized configuration (`config.js`) that automatically detects the correct API base URL. This ensures:
- ✅ No hardcoded URLs in HTML files
- ✅ Works across different deployment environments
- ✅ Prevents OAuth redirect URI mismatches

See [OAUTH_IMPLEMENTATION_SUMMARY.md](./OAUTH_IMPLEMENTATION_SUMMARY.md) for complete implementation details.