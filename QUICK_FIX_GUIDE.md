# Quick Fix Guide: redirect_uri_mismatch Error

## 🚨 Got This Error?

```
Error 400: redirect_uri_mismatch
Request details: redirect_uri=https://multipostapp.co.uk/api/auth/callback/youtube
```

## ⚡ Quick Fix (5 minutes)

### Step 1: Check Your Configuration

**Option A - Visual (Easiest):**
1. Open `oauth-config-checker.html` in your browser
2. Enter your worker URL
3. Click "Check Configuration"

**Option B - Command Line:**
```bash
curl https://your-worker.workers.dev/api/config-check
```

### Step 2: Find Your Worker URL

```bash
wrangler deploy
```

Look for output like:
```
Published multipost-seo-worker
  https://multipost-seo-worker.workers.dev
```

That's your worker URL! ✅

### Step 3: Set BASE_URL to Your Worker URL

```bash
wrangler secret put BASE_URL
```

When prompted, enter your worker URL (from Step 2):
```
https://multipost-seo-worker.workers.dev
```

**⚠️ Important:** 
- NO trailing slash!
- ✅ `https://your-worker.workers.dev`
- ❌ `https://your-worker.workers.dev/`

### Step 4: Set FRONTEND_URL (If Using Separate Frontend)

If your HTML files are on GitHub Pages or a custom domain:

```bash
wrangler secret put FRONTEND_URL
```

Enter your frontend URL:
```
https://multipostapp.co.uk
```

**Skip this step** if your worker serves the frontend too.

### Step 5: Update Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Scroll to "Authorized redirect URIs"
4. Add this URI:
   ```
   https://your-worker.workers.dev/api/auth/callback/youtube
   ```
   Replace `your-worker.workers.dev` with your actual worker URL from Step 2

5. Click "Save"

### Step 6: Verify It Works

**Check configuration:**
```bash
curl https://your-worker.workers.dev/api/config-check
```

Look for `"status": "OK"` in the response.

**Test OAuth flow:**
1. Go to your app
2. Click "Link YouTube"
3. Should redirect to Google and back successfully ✅

## 🤔 Still Not Working?

### Common Mistakes

1. **Used frontend URL instead of worker URL**
   - ❌ BASE_URL = `https://multipostapp.co.uk`
   - ✅ BASE_URL = `https://your-worker.workers.dev`

2. **Trailing slash in BASE_URL**
   - ❌ `https://your-worker.workers.dev/`
   - ✅ `https://your-worker.workers.dev`

3. **Wrong URL in Google Cloud Console**
   - Must match your worker URL exactly
   - Check for typos, trailing slashes

4. **Forgot to click "Save" in Google Cloud Console**
   - Changes don't apply until you save!

### Need More Help?

📖 **Detailed Guide:** [TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md](./TROUBLESHOOTING_REDIRECT_URI_MISMATCH.md)

🔧 **Visual Tool:** [oauth-config-checker.html](./oauth-config-checker.html)

💡 **Complete Docs:** [SOLUTION_SUMMARY.md](./SOLUTION_SUMMARY.md)

## 📝 Understanding BASE_URL vs FRONTEND_URL

**BASE_URL** (Required)
- Your Cloudflare Worker URL
- Handles API and OAuth callbacks
- Example: `https://multipost-seo-worker.workers.dev`

**FRONTEND_URL** (Optional)
- Where your HTML files live
- Where users go after OAuth
- Example: `https://multipostapp.co.uk`

**Why separate?**
- OAuth needs server-side code (Worker)
- Frontend can be on GitHub Pages or custom domain
- Worker handles secure operations, frontend shows UI

## ✅ Success Checklist

- [ ] Found my worker URL with `wrangler deploy`
- [ ] Set `BASE_URL` to my worker URL (no trailing slash)
- [ ] Set `FRONTEND_URL` to my frontend URL (if separate)
- [ ] Added redirect URI to Google Cloud Console
- [ ] Clicked "Save" in Google Cloud Console
- [ ] Verified with `/api/config-check` (status = OK)
- [ ] Tested OAuth flow - it works! 🎉

## 🎯 TL;DR

```bash
# 1. Get worker URL
wrangler deploy

# 2. Set BASE_URL to worker URL
wrangler secret put BASE_URL
# Enter: https://your-worker.workers.dev

# 3. Update Google Cloud Console
# Add: https://your-worker.workers.dev/api/auth/callback/youtube

# 4. Test
curl https://your-worker.workers.dev/api/config-check
```

That's it! ✨
