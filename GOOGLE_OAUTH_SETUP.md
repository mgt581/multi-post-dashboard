# Google OAuth Setup Instructions

## Google Client Credentials

The Google OAuth client ID is already configured in `wrangler.toml`.

**Client ID:** `1099160429576-38kfvgqfgahc80oc11v1abl79n1gdspm.apps.googleusercontent.com`

## Setting the Client Secret

For security reasons, the client secret must be set using Wrangler's secret management:

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
```

When prompted, enter the secret value provided to you securely.

**Note:** This file contains sensitive credentials and is excluded from version control via .gitignore.

The actual secret for this deployment is: `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`

## What This Enables

This Google OAuth configuration enables:
- User sign in with Google
- User sign up with Google  
- YouTube account linking for video uploads

## Authorized Redirect URI

Make sure the following redirect URI is configured in your Google Cloud Console OAuth app:
```
https://your-worker.workers.dev/api/auth/callback/youtube
```

Replace `your-worker.workers.dev` with your actual Cloudflare Worker URL.
