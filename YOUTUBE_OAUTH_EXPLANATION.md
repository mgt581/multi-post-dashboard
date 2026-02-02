# YouTube OAuth Configuration - Explanation

## Question: Do I need a separate YouTube auth file?

**Answer: No, you do NOT need a separate `youtube-auth.js` file.**

## Why Not?

This application uses a **server-side OAuth flow** implemented in the Cloudflare Worker (`worker.js`), not a client-side flow. Here's how it works:

### Current Architecture (Correct ✅)

```
User clicks "Link YouTube" in folder.html
    ↓
Frontend redirects to: /api/auth/youtube (worker.js line 84-86)
    ↓
Worker redirects to Google OAuth
    ↓
User approves on Google
    ↓
Google redirects to: /api/auth/callback/youtube (worker.js line 112-114)
    ↓
Worker exchanges code for token (server-side)
    ↓
Worker saves token to database
    ↓
User redirected back to folder.html with success message
```

### Why Server-Side OAuth is Better

1. **Security**: Client secrets are never exposed to the browser
2. **Token Storage**: Tokens are securely stored in the database, not localStorage
3. **Refresh Tokens**: Server can handle token refresh automatically
4. **Proper Flow**: Uses authorization code flow instead of deprecated implicit flow

## What You Need to Configure

### 1. Environment Variables (Required)

Set these in your Cloudflare Worker using `wrangler secret put`:

```bash
# Google OAuth credentials
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# Your worker URL
wrangler secret put BASE_URL
# Example: https://your-worker.workers.dev
```

### 2. Google Cloud Console OAuth Settings

In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Create OAuth 2.0 credentials
2. Add this **Authorized redirect URI**:
   ```
   https://your-worker.workers.dev/api/auth/callback/youtube
   ```
   ⚠️ Replace `your-worker.workers.dev` with your actual worker URL
   
3. Copy the Client ID and Client Secret
4. Set them as environment variables (see step 1)

## Common Mistakes

❌ **Wrong**: Creating a client-side `youtube-auth.js` file  
✅ **Correct**: Using the server-side OAuth flow in `worker.js`

❌ **Wrong**: Using `response_type=token` (implicit flow)  
✅ **Correct**: Using `response_type=code` (authorization code flow)

❌ **Wrong**: Putting credentials in JavaScript files  
✅ **Correct**: Storing credentials as Cloudflare Worker secrets

## Testing the OAuth Flow

1. Deploy your worker: `wrangler deploy`
2. Set all required secrets (see above)
3. Configure Google Cloud Console redirect URI
4. Visit your app and click "Link YouTube" in a folder
5. You should be redirected to Google, then back to your app with a success message

## Need More Help?

- **Quick Reference**: See [REDIRECT_URI_GUIDE.md](./REDIRECT_URI_GUIDE.md)
- **Detailed Setup**: See [OAUTH_FIX_README.md](./OAUTH_FIX_README.md)
- **Deployment**: See [DEPLOY.md](./DEPLOY.md)
