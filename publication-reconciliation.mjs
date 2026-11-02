import { evaluateFacebookVideoReadiness } from './facebook-video-readiness.mjs';
import { evaluateTikTokPublishStatus } from './tiktok-publish-status.mjs';

const graphBase = 'https://graph.facebook.com/v18.0';

/** Reconcile only provider-confirmed outcomes. Unknown responses retain a place for review. */
export async function reconcilePendingPublications(env, fetcher = fetch, now = Math.floor(Date.now() / 1000)) {
  const { results = [] } = await env.DB.prepare(`SELECT s.id AS slot_id, s.user_id, s.platform,
      u.id AS session_id, u.video_id, u.access_token, u.page_id, u.title
    FROM billing_publish_slots s
    JOIN billing_publish_sessions b ON b.slot_id = s.id
    JOIN upload_sessions u ON u.id = b.session_id
    WHERE s.status = 'pending' AND s.platform IN ('facebook', 'tiktok')
      AND u.video_id IS NOT NULL AND u.access_token IS NOT NULL
    ORDER BY COALESCE(s.reconciled_at, 0), s.created_at LIMIT 30`).all();
  let completed = 0;
  let failed = 0;
  for (const item of results) {
    try {
      let ready = false;
      let rejected = false;
      if (item.platform === 'facebook') {
        const params = new URLSearchParams({ access_token: item.access_token, fields: 'id,status,permalink_url,published' });
        if (env.FB_CLIENT_SECRET) {
          const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.FB_CLIENT_SECRET),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(item.access_token));
          params.set('appsecret_proof', [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''));
        }
        const response = await fetcher(`${graphBase}/${encodeURIComponent(item.video_id)}?${params}`);
        if (!response.ok) throw new Error('Facebook status unavailable');
        const outcome = evaluateFacebookVideoReadiness(item.video_id, await response.json());
        ready = outcome.ready;
        rejected = outcome.failed;
      } else {
        const response = await fetcher(`${String(env.TIKTOK_API_BASE_URL || 'https://open.tiktokapis.com').replace(/\/+$/, '')}/v2/post/publish/status/fetch/`, {
          method: 'POST', headers: { Authorization: `Bearer ${item.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ publish_id: item.video_id })
        });
        if (!response.ok) throw new Error('TikTok status unavailable');
        const result = await response.json();
        if (result?.error?.code && result.error.code !== 'ok') throw new Error('TikTok status unavailable');
        const outcome = evaluateTikTokPublishStatus(result.data || result);
        ready = outcome.publiclyAvailable || (outcome.complete && String(item.title || '').toUpperCase() !== 'PUBLIC_TO_EVERYONE');
        rejected = outcome.failed;
      }
      if (ready || rejected) {
        const status = ready ? 'completed' : 'failed';
        const changed = await env.DB.prepare(`UPDATE billing_publish_slots
          SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END, reconciled_at = ?
          WHERE id = ? AND status = 'pending'`).bind(status, status, now, now, item.slot_id).run();
        if (Number(changed?.meta?.changes ?? changed?.changes ?? 0)) {
          if (ready) {
            completed++;
            await env.DB.prepare(`INSERT INTO billing_usage_events (user_id, event_type, platform, created_at)
              VALUES (?, 'publish_metered', ?, ?)`).bind(item.user_id, item.platform, now).run();
            // The session remains for an already-open page to observe the result.
          } else {
            failed++;
            await env.DB.prepare('DELETE FROM billing_publish_sessions WHERE session_id = ?').bind(item.session_id).run();
            await env.DB.prepare('DELETE FROM upload_sessions WHERE id = ?').bind(item.session_id).run();
          }
        }
      } else {
        await env.DB.prepare("UPDATE billing_publish_slots SET reconciled_at = ? WHERE id = ? AND status = 'pending'")
          .bind(now, item.slot_id).run();
      }
    } catch (error) {
      // A network or provider failure is not evidence of a failed publication.
      console.warn('Publication reconciliation pending', item.platform, item.slot_id, error?.message);
      await env.DB.prepare("UPDATE billing_publish_slots SET reconciled_at = ? WHERE id = ? AND status = 'pending'")
        .bind(now, item.slot_id).run();
    }
  }
  return { scanned: results.length, completed, failed };
}
