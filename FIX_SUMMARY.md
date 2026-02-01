# OAuth Redirect and Account Display Issue - Fix Summary

## Problem Statement
Users reported two critical issues:
1. **"Account signed in and didn't show up on the folder"** - After successfully authenticating with a platform (YouTube, TikTok, Facebook), the linked account would not appear in the folder view
2. **"URL redirect error"** - Users experienced redirect issues during the OAuth flow

## Root Cause
The issue was in `folder.html`. When users navigated from `app.html` to a folder, the folder ID was stored in `localStorage` before navigation. However, after OAuth authentication, the worker would redirect back to `folder.html?id={folderId}` with the folder ID in the URL parameter.

The problem: **folder.html only read the folder ID from localStorage and never checked the URL parameter.**

This meant that after OAuth redirect:
1. The page didn't know which folder to load
2. The `render()` function received `null` for the folder ID
3. The API call to fetch accounts failed silently
4. The newly linked account didn't appear

## Solution Implemented

### Changes to `folder.html`
Added logic to read the folder ID from the URL parameter when the page loads:

```javascript
// Check for folder ID in URL params and update localStorage
const urlParams = new URLSearchParams(window.location.search);
const urlFolderId = urlParams.get('id');
if (urlFolderId) {
  // Update localStorage with the folder ID from URL (important for OAuth redirects)
  // Note: Backend validates folder ownership via user_id in API calls
  localStorage.setItem(scopedKey("activeFolderId"), urlFolderId);
}
```

Also added user feedback for successful authentication:
```javascript
if (success === 'account_linked') {
  alert('Platform account successfully linked!');
  window.history.replaceState({}, document.title, window.location.pathname + '?id=' + urlFolderId);
}
```

### Changes to `worker.js`
Updated the OAuth success redirect to include a success parameter:

```javascript
return Response.redirect(`${frontendUrl}/folder.html?id=${folderId}&success=account_linked`);
```

## How the Fix Works

### Normal Navigation (app.html → folder.html)
1. User clicks a folder in app.html
2. app.html sets `activeFolderId` in localStorage
3. app.html navigates to `folder.html?id=123`
4. folder.html reads URL parameter and updates localStorage ✓ (redundant but harmless)
5. folder.html renders accounts ✓

### OAuth Flow (folder.html → OAuth → folder.html)
1. User clicks "Link" button for a platform
2. Browser redirects to `/api/auth/{platform}?folder_id=123&user_id=xxx`
3. User authorizes on the platform's website
4. Platform redirects to `/api/auth/callback/{platform}?code=xxx&state=...`
5. Worker exchanges authorization code for access token
6. Worker saves account to database
7. Worker redirects to `folder.html?id=123&success=account_linked`
8. **folder.html reads `id` from URL and updates localStorage** ✓ (NEW FIX)
9. folder.html shows success message ✓ (NEW FIX)
10. folder.html renders accounts including the newly linked one ✓

## Security Considerations

While the folder ID is now read from the URL parameter, security is maintained because:

1. **Backend Validation**: The `/api/get-accounts` endpoint requires both `folder_id` AND `user_id` parameters and validates they match in the database
2. **User Scoping**: All API calls include the authenticated user's ID from Firebase Auth
3. **No Data Leakage**: Even if someone crafts a URL with a different folder ID, they won't see any data that doesn't belong to them

## Testing Instructions

To verify the fix works:

1. **Deploy the updated code**:
   ```bash
   wrangler deploy
   ```

2. **Test OAuth flow**:
   - Log in to your app
   - Navigate to a folder
   - Click "Link New Account"
   - Select a platform (YouTube, TikTok, or Facebook)
   - Complete the OAuth authorization
   - **Expected**: You should be redirected back to the folder page with a success message
   - **Expected**: The newly linked account should appear in the "Connected Platforms" list

3. **Test error handling**:
   - Try linking an account but deny access when prompted
   - **Expected**: You should see an appropriate error message
   - **Expected**: You should still be on the correct folder page

## Files Changed
- `folder.html` - Added URL parameter reading and success message display
- `worker.js` - Added success parameter to OAuth redirect URL

## No Breaking Changes
This fix is backward compatible. It doesn't change any existing functionality - it only adds missing functionality for the OAuth redirect flow.
