# Meta App Review — Multi Post

## App review overview

Multi Post is a multi-brand social publishing dashboard for users who manage
multiple Facebook Pages. The reviewed Facebook flow starts with **Log in with
Facebook**, then lets the signed-in user organise Pages into separate brand
workspaces, choose the correct Page for each workspace, and publish
user-created image and video posts to that Page. The requested Facebook
permissions are essential parts of this single end-to-end workflow:

1. `public_profile` identifies the person connecting Facebook and displays their
   name and profile picture.
2. `pages_show_list` retrieves the Pages that person is authorised to manage so
   Multi Post can display the Page picker.
3. `pages_manage_posts` publishes content only after the user selects a Page,
   chooses the media, enters the post details, and presses the publish button.

This is not a one-Page utility or an internal tool. Users can create multiple
brand workspaces, connect a different Facebook Page to each workspace, change
the selected Page, and manage publishing destinations from one dashboard.

## Permissions and access to configure

Request Advanced Access only for the Page permissions the product uses:

- `pages_show_list`
- `pages_manage_posts`

Use the standard `public_profile` permission for Facebook Login. Sign-in is part
of the review flow and must be shown first, before requesting Page publishing
permissions from inside a workspace. The Page-linking dialog may also include
`public_profile` as the baseline supported Facebook Login permission alongside
the Page permissions, but the app uses profile data only to identify the person
connecting Facebook.

Do not request `email` unless the product begins reading and using the Facebook
account email address.

Do not submit unrelated Meta features or permissions for this review. Multi Post
does not use Business Manager APIs, Live Video, branded content ads, creator
marketplace discovery, Page comment moderation, Page metadata/webhooks,
user-generated Page content, or Insights in the current Facebook publishing
flow. Leave these unrequested or remove them from the review bundle if they are
listed in the dashboard:

- Business Asset User Profile Access
- Live Video API
- `business_management`
- `email`
- `facebook_branded_content_ads_brand`
- `facebook_creator_marketplace_discovery`
- `pages_manage_engagement`
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_read_user_content`
- `read_insights`

## Copy-ready permission explanations

### public_profile

Multi Post uses `public_profile` when a user chooses **Log in with Facebook** on
the sign-in page.
After consent, the app reads the user's Facebook ID, name, and profile picture
from `/me?fields=id,name,picture`. The server uses the stable Facebook ID to mint
a Firebase custom token. The name and profile picture identify which Facebook
user connected the account and make the account recognisable in Multi Post's
multi-workspace interface. Multi Post does not publish content during sign-in.

### pages_show_list

Multi Post uses `pages_show_list` after an authenticated user opens a workspace
and selects **Link Facebook**. The app calls `/me/accounts` to show only the
Facebook Pages the user is authorised to manage. The Page picker displays each
Page's name and picture. The user explicitly chooses one Page as the publishing
destination for that workspace and can later use **Change Page** to select a
different managed Page. This permission is fundamental because the app is
designed for users who organise and publish across multiple Facebook Pages.

### pages_manage_posts

Multi Post uses `pages_manage_posts` only when the user explicitly presses
**Publish to Facebook**. For images it publishes to `/{page-id}/photos`. For
videos and Reels it uses the `/{page-id}/video_reels` start, upload, and finish
flow. The user selects the media, supplies the title/caption, sees the selected
Page, and initiates every publication. Multi Post never publishes automatically
or silently. After success, it displays a link to the resulting Facebook post.
Publishing user-prepared content across the Pages assigned to each brand
workspace is the app's primary function.

## Reviewer access instructions

1. Visit `https://multipostapp.co.uk/signin.html`.
2. Select **Log in with Facebook** and complete Facebook Login with the supplied
   Facebook reviewer/test user. This demonstrates the `public_profile` sign-in
   use case and returns the reviewer to Multi Post.
3. Open an existing workspace or create a workspace.
4. Select **Link** beside Facebook.
5. Complete the Page permission consent for the same supplied Facebook test
   user. The test user must have sufficient task access to the supplied test
   Page.
6. Select the test Page in Multi Post's Page picker.
7. Open **Create Post** and confirm the selected Page is shown as the Facebook
   destination.
8. Choose the supplied review-safe image or MP4, enter a title and description,
   and press **Publish to Facebook**.
9. Use the success link to verify that the post was created on the test Page.

Provide reviewer credentials and the test Page name in Meta's review notes. Do
not put passwords, access tokens, app secrets, or service-account keys in this
repository.

## Screen-recording script

Record at 1080p with the entire browser window visible. Use a fresh private
window or revoke the app first so the Facebook consent screen appears.

1. Show `multipostapp.co.uk/signin.html` in the address bar and click **Log in
   with Facebook**.
2. Show the Facebook Login consent screen for `public_profile`, then return to
   Multi Post signed in.
3. Briefly show the Active Brands screen with multiple brand workspaces. Explain
   that each workspace can have its own Facebook Page.
4. Open one workspace and click **Link** beside Facebook.
5. Show the Facebook consent screen and the requested Page permissions.
6. Continue and return to Multi Post.
7. Show the Page picker populated with multiple managed Pages
   (`pages_show_list`).
8. Select the review Page and show its name/picture in the workspace.
9. Use **Change Page** and briefly reopen the Page picker to demonstrate that the
   app genuinely manages multiple Pages, then keep the review Page selected.
10. Open **Create Post** and show that same Page as the destination.
11. Select a short, review-safe MP4 or image and enter the title and description.
12. Click **Publish to Facebook** (`pages_manage_posts`).
13. Wait for the success state, open the resulting Facebook URL, and show the
    post on the selected Page.

Keep the recording concise and avoid developer tools, source code, unrelated
tabs, personal notifications, or any secret values.

## Pre-submission checks

- App icon, app name, domain, privacy policy, terms, and data-deletion
  instructions all use the same Multi Post identity.
- The Meta app has a Facebook Login/authentication use case configured with
   `public_profile` available, so the app is not submitted with only Page
   permissions.
- `https://multipostapp.co.uk/api/auth/callback/facebook` is registered as an
  exact valid OAuth redirect URI.
- The app domain includes `multipostapp.co.uk`.
- The reviewer Facebook account can manage the supplied test Page.
- The test Page is visible in the Page picker and accepts a real test post.
- Facebook Login requests `public_profile`, `pages_show_list`, and
  `pages_manage_posts`; no `pages_read_engagement` permission is requested.
- Each requested permission is demonstrated visibly in the recording.
