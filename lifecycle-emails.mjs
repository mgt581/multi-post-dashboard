// Free plan lifecycle emails, sent by the 5-minute cron through Resend.
//  1. Welcome: soon after sign-up (accounts created in the last 3 days only).
//  2. Day 2 nudge: 48h after sign-up if the account has not posted yet.
//  3. Free posts used: once any platform's 3 free posts are used.
//  4. Win-back (one-off): rows marked winback_due = 1, for sign-ups from before the Free plan.
// Nobody on a trial, a paid plan, or who unsubscribed is emailed. Each email is sent once.

const DAY = 86400;
const FREE_POSTS_PER_PLATFORM = 3;
const SITE = "https://multipostapp.co.uk";

export function firstNameOf(displayName) {
  const first = String(displayName || "").trim().split(/\s+/)[0] || "";
  return /^[\p{L}'-]{1,30}$/u.test(first) ? first : "";
}

// Called with a verified Firebase identity whenever the app loads billing status.
export async function recordLifecycleUser(db, identity) {
  if (!identity?.userId || !identity.emailVerified || !identity.email) return;
  const signedUpAt = Math.floor(Number(identity.createdAt || 0) / 1000) || Math.floor(Date.now() / 1000);
  const token = crypto.randomUUID().replace(/-/g, "");
  await db.prepare(`INSERT OR IGNORE INTO lifecycle_emails (user_id, email, first_name, signed_up_at, unsubscribe_token)
    VALUES (?, ?, ?, ?, ?)`).bind(identity.userId, identity.email, firstNameOf(identity.displayName), signedUpAt, token).run();
}

function unsubscribeUrl(row) {
  return `${SITE}/api/unsubscribe?u=${encodeURIComponent(row.user_id)}&t=${encodeURIComponent(row.unsubscribe_token)}`;
}

export function lifecycleEmail(kind, row) {
  const hi = row.first_name ? `Hi ${row.first_name},` : "Hi there,";
  const sign = "\n\nAlex\nMultiPost";
  const footer = `\n\n—\nYou're getting this because you signed up for MultiPost. Unsubscribe: ${unsubscribeUrl(row)}`;
  const emails = {
    welcome: {
      subject: "Welcome to MultiPost: your 3 free posts are ready",
      text: `${hi}\n\nThanks for signing up. You're on the Free plan: no card needed, and you get 3 free posts on each of YouTube, TikTok and Facebook.\n\nTo make your first one:\n1. Open ${SITE}/app.html and go into your workspace\n2. Connect YouTube, TikTok or Facebook\n3. Upload a video or image. MultiPost writes the title, caption and hashtags for each platform\n4. Check it and press Publish\n\nYour accounts stay connected, so whenever you want more, upgrading takes one tap.\n\nAny questions, just reply to this email.`
    },
    nudge: {
      subject: "Your first post takes 2 minutes",
      text: `${hi}\n\nYou haven't used your free posts yet, so here's the quickest way:\n\n1. Open ${SITE}/app.html\n2. Connect one account (YouTube, TikTok or Facebook)\n3. Upload one video or image and let MultiPost write the caption\n4. Press Publish\n\nYou've got 3 free posts on each platform, no card needed.\n\nStuck on any step? Reply to this email and I'll help you myself.`
    },
    winback: {
      subject: "MultiPost is now free to try, no card needed",
      text: `${hi}\n\nYou signed up for MultiPost last week. Back then you had to start a trial before you could do anything, and I don't think that was fair.\n\nSo I've changed it. You now get 3 free posts on each of YouTube, TikTok and Facebook, with no card and no trial needed.\n\n1. Open ${SITE}/app.html (you're already signed up)\n2. Connect an account\n3. Upload a video or image. MultiPost writes the caption and hashtags for each platform\n4. Press Publish\n\nIf anything gets in your way, just reply to this email and I'll help you myself.`
    },
    free_used: {
      subject: "You've used your free posts: your setup is saved",
      text: `${hi}\n\nYou've used your free MultiPost posts. Nice work.\n\nYour workspace and connected accounts are all saved. To keep posting, start the 7-day free trial: ${SITE}/pricing.html\n\nPro is £9.99/month after the trial, and you can cancel any time before it ends.\n\nThanks for trying MultiPost.`
    }
  };
  const email = emails[kind];
  return { subject: email.subject, text: email.text + sign + footer };
}

async function hasAccess(db, userId, email) {
  const row = await db.prepare(`SELECT 1 FROM billing_subscriptions WHERE (user_id = ? OR lower(user_email) = ?)
    AND subscription_status IN ('active','trialing') LIMIT 1`).bind(userId, email).first();
  if (row) return true;
  try {
    const play = await db.prepare(`SELECT 1 FROM billing_play_purchases WHERE user_id = ?
      AND subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD') LIMIT 1`).bind(userId).first();
    return Boolean(play);
  } catch (_) { return false; }
}

async function postsMade(db, userId) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM billing_publish_slots WHERE user_id = ? AND status = 'completed'`).bind(userId).first();
  return Number(row?.c || 0);
}

async function freePostsUsedUp(db, userId) {
  const row = await db.prepare(`SELECT MAX(c) AS m FROM (SELECT COUNT(*) AS c FROM billing_publish_slots
    WHERE user_id = ? AND status = 'completed' GROUP BY platform)`).bind(userId).first();
  return Number(row?.m || 0) >= FREE_POSTS_PER_PLATFORM;
}

async function send(env, row, kind, fetchImpl) {
  const { subject, text } = lifecycleEmail(kind, row);
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.LIFECYCLE_FROM || "Alex at MultiPost <info@multipostapp.co.uk>",
      to: [row.email],
      reply_to: env.LIFECYCLE_REPLY_TO || "info@multipostapp.co.uk",
      subject,
      text,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl(row)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    })
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 300); } catch (_) {}
    console.warn(`Lifecycle email ${kind} not sent: Resend ${res.status} ${detail}`);
  }
  return res.ok;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs from the cron. Sends at most `limit` emails per run, spaced out for Resend's rate limit.
export async function sendLifecycleEmails(env, { now = Math.floor(Date.now() / 1000), fetchImpl = fetch, limit = 20, gapMs = 250 } = {}) {
  if (!env?.RESEND_API_KEY || !env?.DB || String(env.LIFECYCLE_EMAILS_ENABLED || "true") === "false") return { sent: 0 };
  const db = env.DB;
  const owners = String(env.BILLING_OWNER_EMAILS || env.OWNER_EMAILS || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  const { results } = await db.prepare(`SELECT * FROM lifecycle_emails WHERE unsubscribed_at IS NULL AND (
      (welcome_sent_at IS NULL AND signed_up_at > ?)
      OR (nudge_sent_at IS NULL AND signed_up_at <= ? AND signed_up_at > ?)
      OR free_used_sent_at IS NULL
      OR (winback_due = 1 AND winback_sent_at IS NULL))
    ORDER BY signed_up_at DESC LIMIT 200`).bind(now - 3 * DAY, now - 2 * DAY, now - 10 * DAY).all();
  let sent = 0;
  for (const row of results || []) {
    if (sent >= limit) break;
    if (owners.includes(String(row.email).toLowerCase())) continue;
    if (await hasAccess(db, row.user_id, String(row.email).toLowerCase())) continue;
    let kind = null;
    if (!row.free_used_sent_at && await freePostsUsedUp(db, row.user_id)) kind = "free_used";
    else if (row.winback_due === 1 && !row.winback_sent_at) kind = await postsMade(db, row.user_id) === 0 ? "winback" : null;
    else if (!row.free_used_sent_at && !row.welcome_sent_at && row.signed_up_at > now - 3 * DAY) kind = "welcome";
    else if (!row.free_used_sent_at && !row.nudge_sent_at && row.welcome_sent_at && row.signed_up_at <= now - 2 * DAY && row.signed_up_at > now - 10 * DAY
      && await postsMade(db, row.user_id) === 0) kind = "nudge";
    if (!kind) continue;
    const column = { welcome: "welcome_sent_at", nudge: "nudge_sent_at", free_used: "free_used_sent_at", winback: "winback_sent_at" }[kind];
    // Claim first so two overlapping cron runs can never send the same email twice.
    const claimed = await db.prepare(`UPDATE lifecycle_emails SET ${column} = ? WHERE user_id = ? AND ${column} IS NULL`).bind(now, row.user_id).run();
    if (!Number(claimed?.meta?.changes ?? claimed?.changes ?? 0)) continue;
    let ok = false;
    try { ok = await send(env, row, kind, fetchImpl); } catch (error) { console.warn(`Lifecycle email ${kind} failed: ${error?.message || error}`); ok = false; }
    if (!ok) { await db.prepare(`UPDATE lifecycle_emails SET ${column} = NULL WHERE user_id = ?`).bind(row.user_id).run(); break; }
    sent++;
    if (gapMs) await pause(gapMs);
  }
  return { sent };
}

export async function unsubscribe(db, userId, token) {
  if (!userId || !token) return false;
  const res = await db.prepare(`UPDATE lifecycle_emails SET unsubscribed_at = strftime('%s','now')
    WHERE user_id = ? AND unsubscribe_token = ?`).bind(String(userId), String(token)).run();
  return Number(res?.meta?.changes ?? res?.changes ?? 0) > 0;
}
