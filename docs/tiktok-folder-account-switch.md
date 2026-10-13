# TikTok folder connection fix — review and release notes

Branch: `fix/tiktok-folder-account-switch`.
Baseline: `3e207add27f4f6e3d13b213028bd5a0a54c825fe` (main on 13 October 2026).
Preview: https://multipost-tiktok-folder-preview.alexbryant.workers.dev/

## Finding and reproduction

Production's read-only `/api/health` returned `2026-10-11-trial-entitlement-countdown`, matching the checked-out worker's baseline version marker. No live account connections or production database rows were changed or inspected.

The existing TikTok publishing authorization URL omits `disable_auto_auth`. TikTok documents that `disable_auto_auth=0` can skip authorization for valid sessions, while `1` always shows authorization: https://developers.tiktok.com/docs/en/login-kit-web . This setting shows consent; it does not promise Google's `select_account` behavior or log the user out of TikTok. Multi Post cannot clear TikTok's cross-domain session cookies.

A local SQLite reproduction ran the original main worker callback with synthetic provider responses. Returning Alice for both folders stored Alice in both. Returning Alice for A and Bob for B preserved distinct links. This distinguishes provider identity reuse from a database rule forcing one account per user. The original accounts insertion/deletion is scoped to user + folder and the tokens uniqueness is `(folder_id, platform, account_id)`, not user + platform.

Separate backend bugs did exist: publishing-link state was only base64 JSON, callback login-mode selection depended on any login cookie being present, reconnect retained old token identities, disconnect retained token snapshots, init-upload fell back to folder-only snapshots, upload sessions lacked user/folder ownership, and the legacy account-ID publishing endpoint accepted an unscoped account. These could cause stale credential reuse or unauthorized access independently of browser session reuse.

This is a source-level and synthetic-provider reproduction. Two real TikTok browser sessions and real posting were not exercised; that remains a release acceptance check.

## Implemented behavior

- Explicit TikTok connection/switch dialog explains the browser session and links to TikTok in a new tab. Existing connection is kept until a successful exchange/save. Other folders are untouched.
- Authenticated POST initiates linking. The Firebase identity must match the requested user key (UID, or verified email for legacy email-keyed data) and own the folder.
- Cryptographically random state and browser nonce are stored server-side for ten minutes. The HttpOnly/Secure/SameSite=Lax nonce cookie is required. State is consumed once atomically, and callback rechecks folder existence/ownership. Unsigned legacy linking states are rejected.
- Linking and account sign-in callbacks are differentiated by the link-state namespace, including when a stale sign-in cookie is present.
- `disable_auto_auth=1` requests TikTok's authorization screen. If the returned identity is already linked in another workspace, linking stops with switch instructions and preserves both existing links. Legacy identities are detected via a token snapshot matching the currently linked credential, where available.
- Real TikTok `open_id` is stored alongside each link; one current TikTok account is selected per folder. Replacement removes only that folder's account/token snapshots in an atomic D1 batch.
- Publishing selects only the current owned-folder account, never orphan snapshots. Sessions carry user/folder ownership; cross-folder status/chunk requests are rejected. Legacy account-ID publishing also checks platform, user and folder.
- Refresh identity is checked, and conditional persistence prevents a late refresh recreating a disconnected/replaced link.
- Disconnect removes account, mirror credentials, sessions and pending linking attempts locally. It does not revoke TikTok globally, because that could invalidate another existing folder connected to the same TikTok identity.
- Account listing requires authentication and folder ownership; TikTok tokens are omitted from responses. Browser callers now send Firebase headers. Alias expansion from untrusted `user_email` is not used for this endpoint.
- Facebook/YouTube OAuth parameters, SEO, billing prices/limits and provider implementations are unchanged. Shared account-list/delete callers now send authentication. Existing unverified email-keyed accounts must verify email to use these protected operations; UID-keyed accounts do not need email.

## Validation

`npm test`: 53 passing tests, including nine new SQLite/Worker regressions covering two accounts/two folders, reconnect/disconnect, target tokens sent to the publishing provider, duplicate provider identity, stale login cookie, cancellation, exchange/network errors, malformed/expired/replayed/browser-mismatched state, ownership, token redaction, wrong account-ID target, rollback, migration preservation, refresh identity mismatch and late refresh after disconnect.

Production Worker dry-run build and browser-script syntax checks pass. The PR workflow runs the full suite on Node 24 and dry-run builds both production and preview entries without deploying.

Browser preview verification: Alice in A; Alice again in B produces switch warning; Bob in B succeeds; B's simulated publishing target is Bob while A stays Alice. No content was published.

## Preview isolation and limits

Separate Worker `multipost-tiktok-folder-preview`, no production routes, fresh D1 `multipost-tiktok-isolated-preview-20261013` (`e8d81af5-b46f-4dad-9710-c1b26ed03b20`). No production tokens, TikTok client secret, billing data or OpenAI key were copied.

The public `/demo` review uses per-browser synthetic folders and the actual OAuth-state/persistence/selection helpers. The application HTML is available via `/signin.html`, with API addresses rewritten to this isolated Worker. Application routes use the real fixed Worker with normal Firebase verification and a synthetic TikTok provider. Live posting, Google/Facebook provider logins, SEO and billing endpoints are disabled. The synthetic provider is implemented only in the preview entrypoint, never in production `worker.js`.

To rebuild/redeploy this existing preview:

```sh
node scripts/build-tiktok-preview.mjs
npx wrangler deploy --config wrangler.tiktok-preview.toml
```

## User steps after release

1. Sign into Multi Post and open workspace A. Choose **Connect TikTok account**, continue and authorize account A.
2. Open workspace B and choose **Connect TikTok account** (or **Connect another TikTok account** to replace its current link).
3. Use **Open TikTok to switch accounts**. Log out or switch to account B on tiktok.com in the same browser. Return to Multi Post and continue.
4. Check the account TikTok shows before authorizing, then check the connected account name in the workspace before posting.
5. If TikTok still returns A, the app gives switch instructions. Retry after switching the TikTok browser session. Switching accounts in the phone app alone may not switch the browser session.

Existing subscription account caps still apply. Reconnecting the same folder does not use an additional slot.

## Production release — explicit approval required

Do not merge or deploy until the user approves. The PR is draft. This preview does not require a real TikTok redirect registration; real-provider staging acceptance does require an isolated app/client and a registered HTTPS callback. Do not direct preview callbacks to production or copy production credentials to the fixture preview.

Before an approved release:

1. Confirm the current production schema contains the baseline accounts/upload_sessions tables and lacks the new columns/table. Confirm email-keyed users are verified and any owner aliases match folder/account user keys; the old untrusted alias expansion is intentionally disallowed.
2. Finish existing TikTok uploads first: legacy upload sessions cannot be read through the new ownership filters. Old OAuth linking attempts should be restarted.
3. Back up production D1 through the approved release procedure. Apply **only** `migrations/0008_tiktok_folder_oauth.sql` once to the production database. It is additive and retains all linked account/token rows. Do not blindly run the historical migration directory (it contains duplicate 0004 identifiers). No cleanup/backfill of production credentials is required.
4. Merge/release the reviewed commit, deploy the Worker and static frontend together (main pushes trigger Worker deployment; ensure the existing static-site deploy is also complete). Clear/update the app service-worker cache if it still serves old folder scripts.
5. With two real accounts, connect A/B in their respective folders, verify the provider identity shown and each publish target, reconnect A and remove/reconnect B, check cancellation and existing Facebook/YouTube/SEO/subscription flows. Use only explicitly approved content if doing real publishing.

Rollback: revert Worker/frontend to the previous release, leave additive schema columns/table in place. Do not delete or restore live token rows automatically. No production changes have been performed by this task.
