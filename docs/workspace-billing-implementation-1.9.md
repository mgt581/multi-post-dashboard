# MultiPostApp 1.9 workspace and publication implementation

Prepared on `feat/subscription-stage2-play-billing`. No production migration,
deployment, Play configuration, payment or release was performed.

## Play catalogue and checkout

Keep `multipost_pro` with `monthly` (£9.99 UK) and `yearly` (£79.99 UK), plus
the existing draft offers `trial-7d-monthly` and `trial-7d-yearly`.
The approved workspace catalogue is ten distinct auto-renewing products,
`multipost_workspace_01` through `multipost_workspace_10`. Each needs a
`monthly` base plan at £4.99 UK and `yearly` at £39.99 UK, with Play-converted
regional prices. The add-ons must use the Pro period. Android hides checkout
unless all ten product details for the period are available in a known non-KR
region. South Korea keeps the main Pro offer without add-on checkout. The ten
products have not been created in Play Console by this code change.
If all ten distinct products remain paid but one is scheduled not to renew,
the add button stays disabled until a product expires; `KEEP_EXISTING` must
not be presented as a way to re-enable a scheduled removal. Validate that
edge case with a licensed tester before offering any alternative flow.

Android supplies the old purchase token, marks unchanged items
`KEEP_EXISTING`, and asks Play to add/remove distinct items. Play quotes the
prorated addition; a removed item remains usable until its paid expiry. The
server grants one extra workspace only for each unique, unexpired, paid API
line item matching the Pro period and obfuscated Firebase account ID. Client
success alone grants nothing. Token claims prevent account reassignment.
Expired, canceled, refunded and grace states come from Google, with a five
minute cache. Stripe entitlement handling remains present.

Workspace creation observes the verified allowance. Existing folders above
a lower allowance remain saved and are marked locked. Owners can select which
folders stay active; protected folder operations check that selection. A Play
workspace adds one social account place per supported platform.

## Publication reconciliation

The Worker reserves a place before publishing and releases it on synchronous
failure. A Facebook Reel remains pending after Meta accepts `finish`; one
server-verified published status, ready processing status and valid Facebook
permalink now confirm it for the UI. Explicit Facebook/TikTok failures release
places. The configured five-minute scheduled handler checks up to 30 pending
Facebook/TikTok sessions per run, rotating through uncertain results. A
conditional slot update ensures a confirmed success counts once. Unknown
provider/network states retain their reservations. Confirmed slots are counted
in the month they complete, including across month boundaries.

An upload can finish without the Worker receiving a YouTube video ID. That
unknown pending reservation needs operator review; it cannot safely be
released or confirmed automatically. An asynchronous provider confirmation
after month rollover can exceed the new month's 150 limit because the already
published post cannot be rolled back. These remain internal-testing gates.

## Migration and release order (not executed)

Check the remote D1 migration ledger. Apply existing 0009–0012 if needed,
then `0013_workspace_item_entitlements.sql`, `0014_workspace_choices.sql`, and
`0015_publication_reconciliation.sql` in order. After approval, deploy Worker
modules and the coordinated `app.html`, `settings.html`, `create-post.html`.
The Worker config enables the reconciliation trigger on deployment. Keep the
Play products and offers inactive until coordinated testing is authorised.

## Evidence and remaining gates

The full JavaScript suite passed locally: 121 tests, 0 failures. It covers
quotas, concurrency, confirmed and failed posts, reconciliation, workspace
locking, Play verification and Stripe fallback. Worker module syntax and
`wrangler.toml` parsing pass. `npm run build` cannot do Wrangler's dry run
because this isolated clone has no installed `wrangler` binary; install the
declared development dependency in an ordinary network-enabled environment.
In-memory SQLite fixtures apply migrations 0011 and 0012 without touching D1.
Gradle never reaches compilation in this execution environment: its daemon
cannot bind a local TCP socket (`java.net.SocketException: Operation not
permitted`). Run `./gradlew :app:assembleDebug :app:testDebugUnitTest` in a
normal local Android Studio shell. Source declares `versionCode 10`,
`versionName 1.9.1`; check the current Play maximum again before building.
The existing signed 1.8 AAB has upload SHA-256
`3D:37:61:C3:F4:61:CC:82:BF:E6:86:D2:95:F0:82:3C:A2:6A:5D:01:5B:8C:31:2D:78:AF:47:23:E0:D4:BD:1A`.
The candidate keystore has not been authenticated against this certificate.
Do not sign a bundle yet.

Licensed Play tests are required for the catalogue, proration, scheduled
removal, period changes, restored tokens, trials, refunds, converted prices
and South Korea. Real-time Developer Notifications are not integrated; a
mid-cache revocation can retain access for up to five minutes. Live Stripe
cancellation timing, new users, and social providers need device tests.
