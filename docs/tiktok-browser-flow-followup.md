# TikTok folder linking follow-up to PR #163

Branch: `fix/tiktok-browser-session-flow`. Baseline: `fe7e46c`.
Isolated preview: https://multipost-tiktok-browser-preview.alexbryant.workers.dev/
Production remains unchanged. No production database, token, or account rows were read or written. No migrations are needed.

## Confirmed findings

On 15 October 2026 the live health endpoint reported `2026-10-13-tiktok-folder-link`, and live `folder.html` contained PR #163's POST-based linking dialog. Live `sw.js` was byte-identical to the repository baseline. This rules out simply assuming that the earlier fix had not shipped.

1. **The live service worker breaks OAuth initiation.** Both app.html and folder.html register it. It intercepts every `/api/auth/*` request and returns a 302 to the direct Worker host. The new authenticated POST `/api/auth/tiktok` therefore becomes GET, discarding the JSON user/folder body; the backend deliberately accepts only POST. Cross-host routing also conflicts with the browser-bound OAuth nonce cookie. Earlier tests called the Worker directly and the earlier preview explicitly disabled the service worker, so both missed this deployed integration defect. Users without an active service worker may take a different path; this does not establish which path the reporting user's browser took.
2. **www and apex nonce mismatch.** Even without that interception, www initiation set a host-only nonce while the registered callback uses apex. That callback cannot consume the state without its nonce. The fix shares only the TikTok linking cookie across the two supported production hosts, retaining Secure/HttpOnly/SameSite=Lax and a ten-minute lifetime. Isolated preview/other hosts remain host-only. State remains random, single-use and bound to the initiating folder and browser.
3. **Provider session reuse remains a separate limitation.** `disable_auto_auth=1` requests the authorization page; it does not log the browser out or guarantee a different account chooser. TikTok's documented web parameters do not promise Google's `select_account` behavior: https://developers.tiktok.com/docs/en/login-kit-web . Multi Post cannot clear cross-domain TikTok cookies. The old dialog let a user immediately continue without switching. The new dialog defaults to a different account, gives numbered browser-switch steps and requires acknowledgment, with a separate explicit option to use the current browser account. Errors reopen the actionable dialog instead of appearing only in an alert.

Existing folder-bound storage and publishing selection remain in place. Callback duplicates fail before replacing either folder's saved link. Switching the browser's TikTok login does not itself disconnect stored Multi Post links. No undocumented logout endpoint or forced-login parameter was introduced.

The real reporting user's exact provider session and device behavior remain unverified. Do not call this a completed real-account fix until the acceptance check below passes.

## Validation and preview

58 automated tests pass. New coverage exercises the actual service worker listener, a pinned copy of the old worker's redirect, preserved POST body, cookie scope on apex/www/isolated hosts, acknowledgment/reset/error behavior, and a www-to-apex callback where a duplicate cannot replace B's existing Bob link or A's Alice link. Existing Worker tests exercise two distinct provider identities and verify the access token sent to upload initialization for each folder, along with cancellation, expiry/replay, ownership, rollback, refresh and disconnect protections.

Production dry-run build and isolated preview deployment succeed. Preview Worker: `multipost-tiktok-browser-preview`; routes empty; separate existing synthetic D1 `multipost-tiktok-isolated-preview-20261013`. No production credentials were copied. Only this isolated Worker was deployed.

The `/demo/workspace` route uses the actual folder markup and connection functions, with a fixture-only authentication bootstrap and isolated session endpoints. It serves the real service worker. The synthetic provider deliberately has **no account chooser on consent**; account switching happens on a separate browser-session page with a persistent cookie. The fixture API is not the production authenticated Worker; production authentication/state/callback behavior is covered by Worker regression tests. The fixture cannot validate real TikTok login, real token exchange or real publishing.

Browser checks: A=Alice; attempt Alice in B opens duplicate warning and leaves A intact; switch separate session tab to Bob; B=Bob; A remains Alice; publishing target checks return Alice for A and Bob for B. No content is published. The in-app browser did not open the target=_blank session link automatically during automation; its observed URL was opened as a separate tab for the test.

`/regression/broken` and `/regression/fixed` provide a browser-visible service-worker POST regression. The baseline fixture changes only the redirect destination to an isolated echo endpoint, preventing any production request. It reports the observed method/body. Browser reproduction returned HTTP 405 and “Observed GET with empty body (POST lost)” under the baseline worker; the fixed worker returned HTTP 200 and “POST body and state creation preserved”. Fixed routing creates a normal isolated OAuth transaction. These registrations are scoped to `/regression/`, independently of workspace pages.

## User steps for account B, after approved release

1. Reload Multi Post so the updated service worker takes control; reopen workspace B.
2. Choose **Connect TikTok account** or **Connect another TikTok account**. Leave **Connect a different TikTok account** selected.
3. Select **Open TikTok in a new tab**. In that browser, use TikTok's profile menu to log out/switch, then sign in as account B. Switching only in the mobile app may not change the browser login.
4. Return to Multi Post, tick **I switched to the TikTok account I want in this browser**, and continue.
5. Check TikTok shows B before authorizing; check B's name in workspace B and A's name in workspace A afterward. If TikTok returns A, the duplicate warning keeps both existing links unchanged.

## Outstanding real-account acceptance and release gate

The current preview is synthetic. A real TikTok staging app/client with a registered HTTPS callback is required to exercise the real flow without sending staging callbacks through production. Do not copy production tokens or secrets into the public fixture Worker. Ask the user which TikTok test app is available and have them perform login/2FA personally; do not request passwords or client secrets in chat.

With an isolated real-provider preview configured: sign into Multi Post, connect real TikTok1 in A, open B, switch TikTok's browser session to TikTok2 and authorize, then verify both names remain. Retry the wrong account, cancellation, reconnect and reload. Validate selected upload targets using server-side selection evidence; any actual post requires separately approved content. Record the real outcome and device/browser before marking acceptance complete.

Do not merge or deploy production without explicit user approval. Release Worker/frontend/sw.js together; no database migration or token cleanup is necessary. If any future schema change is introduced, back up production before migrating. Verify the service worker update on a previously controlled browser; then repeat real A/B acceptance. Rollback reverts Worker/frontend/sw.js; leave token rows unchanged.
