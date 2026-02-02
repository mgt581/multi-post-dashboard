# OAuth Redirect URI - Deployment Verification Checklist

This checklist helps verify that OAuth is correctly configured after deploying the multi-post-dashboard application.

## Pre-Deployment Checklist

### 1. Deploy the Worker
- [ ] Run `wrangler deploy`
- [ ] Note the worker URL (this is your BASE_URL)
  - Example: `https://multipost-seo-worker.alexbryant.workers.dev`
- [ ] Verify deployment successful

### 2. Set Environment Variables
- [ ] Set BASE_URL: `wrangler secret put BASE_URL`
  - Enter your worker URL (from step 1)
- [ ] Set GOOGLE_CLIENT_ID: `wrangler secret put GOOGLE_CLIENT_ID`
- [ ] Set GOOGLE_CLIENT_SECRET: `wrangler secret put GOOGLE_CLIENT_SECRET`
- [ ] Set TIKTOK_CLIENT_KEY: `wrangler secret put TIKTOK_CLIENT_KEY`
- [ ] Set TIKTOK_CLIENT_SECRET: `wrangler secret put TIKTOK_CLIENT_SECRET`
- [ ] Set FB_CLIENT_ID: `wrangler secret put FB_CLIENT_ID`
- [ ] Set FB_CLIENT_SECRET: `wrangler secret put FB_CLIENT_SECRET`
- [ ] (Optional) Set FRONTEND_URL if hosting HTML files separately

### 3. Verify Secrets
```bash
wrangler secret list
```
- [ ] Verify all required secrets are listed
- [ ] BASE_URL should be in the list
- [ ] All OAuth client IDs and secrets should be present

## OAuth Provider Configuration

### Google Cloud Console (YouTube)

1. Navigate to: https://console.cloud.google.com/apis/credentials
2. Select your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", verify:
   - [ ] `https://YOUR_WORKER_URL/api/auth/callback/youtube` is listed
   - [ ] NO trailing slash
   - [ ] Uses HTTPS
   - [ ] Exactly matches your worker URL

**Example:**
```
https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube
```

### TikTok Developer Portal

1. Navigate to: https://developers.tiktok.com/
2. Select your app → Settings
3. Under "Redirect URI", verify:
   - [ ] `https://YOUR_WORKER_URL/api/auth/callback/tiktok` is listed
   - [ ] NO trailing slash
   - [ ] Uses HTTPS
   - [ ] Exactly matches your worker URL
   - [ ] Case matches exactly (TikTok is case-sensitive)

**Example:**
```
https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok
```

### Meta Developer Dashboard (Facebook)

1. Navigate to: https://developers.facebook.com/apps/
2. Select your app → Facebook Login → Settings
3. Under "Valid OAuth Redirect URIs", verify:
   - [ ] `https://YOUR_WORKER_URL/api/auth/callback/facebook` is listed
   - [ ] NO trailing slash
   - [ ] Uses HTTPS
   - [ ] Exactly matches your worker URL

**Example:**
```
https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook
```

## Post-Deployment Verification

### 1. Check Configuration Endpoint

Visit: `https://YOUR_WORKER_URL/api/config-check`

Verify the response shows:
- [ ] `baseUrl` matches your worker URL
- [ ] `redirectUris` are correct for all three platforms
- [ ] `secretsConfigured` shows `true` for all required secrets

**Expected Response:**
```json
{
  "baseUrl": "https://multipost-seo-worker.alexbryant.workers.dev",
  "frontendUrl": "https://multipost-seo-worker.alexbryant.workers.dev",
  "redirectUris": {
    "youtube": "https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/youtube",
    "tiktok": "https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/tiktok",
    "facebook": "https://multipost-seo-worker.alexbryant.workers.dev/api/auth/callback/facebook"
  },
  "secretsConfigured": {
    "BASE_URL": true,
    "GOOGLE_CLIENT_ID": true,
    "GOOGLE_CLIENT_SECRET": true,
    "TIKTOK_CLIENT_KEY": true,
    "TIKTOK_CLIENT_SECRET": true,
    "FB_CLIENT_ID": true,
    "FB_CLIENT_SECRET": true
  }
}
```

### 2. Test OAuth Flows

For each platform, perform the following test:

#### YouTube OAuth Test
1. Navigate to your application
2. Create a folder if needed
3. Click "Link Now" for YouTube
4. Verify:
   - [ ] Redirects to Google OAuth consent screen
   - [ ] No "redirect_uri_mismatch" error
   - [ ] After consent, redirects back to your app
   - [ ] Account appears as "Connected"
   - [ ] No errors in browser console

#### TikTok OAuth Test
1. Navigate to your application
2. Create a folder if needed
3. Click "Link Now" for TikTok
4. Verify:
   - [ ] Redirects to TikTok authorization screen
   - [ ] No redirect_uri error
   - [ ] After authorization, redirects back to your app
   - [ ] Account appears as "Connected"
   - [ ] No errors in browser console

#### Facebook OAuth Test
1. Navigate to your application
2. Create a folder if needed
3. Click "Link Now" for Facebook
4. Verify:
   - [ ] Redirects to Facebook authorization screen
   - [ ] No redirect_uri error
   - [ ] After authorization, redirects back to your app
   - [ ] Account appears as "Connected"
   - [ ] No errors in browser console

### 3. Check Cloudflare Worker Logs

Navigate to: Cloudflare Dashboard → Workers → Your Worker → Logs

Look for OAuth-related logs:
- [ ] "Initiating OAuth for youtube with redirect URI: ..."
- [ ] "OAuth callback for youtube, callbackUri: ..., has code: true, error: none"
- [ ] "Successfully authenticated youtube for folder ..."

Repeat for TikTok and Facebook.

### 4. Verify Frontend Configuration

Open browser console on your application and check for:
```javascript
API Configuration: {
  baseUrl: "https://YOUR_WORKER_URL/api",
  hostname: "...",
  protocol: "https:"
}
```

- [ ] Verify `baseUrl` points to correct worker URL
- [ ] No errors about missing config.js

## Common Issues Checklist

If OAuth is not working, verify:

### redirect_uri_mismatch Error
- [ ] BASE_URL environment variable matches worker URL exactly
- [ ] OAuth provider console has exact redirect URI (no typos)
- [ ] No trailing slashes in redirect URI
- [ ] Using HTTPS (not HTTP)
- [ ] Case matches exactly (especially for TikTok)

### "Invalid platform" Error
- [ ] Platform name is lowercase (youtube, tiktok, facebook)
- [ ] No typos in platform name
- [ ] Using supported platform

### Token Exchange Failed
- [ ] OAuth client secrets are set correctly
- [ ] Client IDs match what's in OAuth provider console
- [ ] Redirect URI in provider console matches exactly

### Frontend Can't Reach API
- [ ] config.js is loaded (check browser network tab)
- [ ] CORS is enabled in worker.js (already configured)
- [ ] Worker URL is accessible (test `/api/config-check`)

### No Accounts Appearing as Connected
- [ ] Database is properly configured (D1 binding in wrangler.toml)
- [ ] Schema migrations have been run
- [ ] No errors in worker logs during token storage

## Rollback Plan

If issues persist after deployment:

1. **Check previous deployment:**
   ```bash
   wrangler deployments list
   ```

2. **Rollback if needed:**
   ```bash
   wrangler rollback --deployment-id <PREVIOUS_DEPLOYMENT_ID>
   ```

3. **Review logs:**
   - Cloudflare Dashboard → Workers → Logs
   - Look for errors during OAuth flow

4. **Verify secrets:**
   ```bash
   wrangler secret list
   ```

## Success Criteria

Your OAuth implementation is working correctly when:
- ✅ All three platforms can be successfully linked
- ✅ No redirect_uri_mismatch errors occur
- ✅ Accounts appear as "Connected" in the UI
- ✅ `/api/config-check` shows all secrets configured
- ✅ Worker logs show successful OAuth flows
- ✅ No errors in browser console

## Support Resources

If you encounter issues:
- **[OAUTH_IMPLEMENTATION_SUMMARY.md](./OAUTH_IMPLEMENTATION_SUMMARY.md)** - Complete technical details
- **[OAUTH_REDIRECT_URI_FIX_SUMMARY.md](./OAUTH_REDIRECT_URI_FIX_SUMMARY.md)** - Executive summary
- **[DEPLOY.md](./DEPLOY.md)** - Deployment guide
- **[OAUTH_FIX_README.md](./OAUTH_FIX_README.md)** - Troubleshooting guide
- **[REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md)** - Quick reference

## Security Note

The `/api/config-check` endpoint is useful for debugging but shows your redirect URIs and which secrets are configured. In production, consider:
- Monitoring access to this endpoint
- Restricting it to authorized users only
- Or removing it entirely if not needed

This information is not highly sensitive but could aid in reconnaissance for potential attackers.
