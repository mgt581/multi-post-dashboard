const PROVIDER_HOSTS = new Set(['accounts.google.com', 'www.facebook.com', 'www.tiktok.com']);
const ticketHash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');

// Move the browser-binding cookie into the actual authorization browser,
// without putting a Firebase token or provider credential in a URL.
export async function createAndroidOAuthHandoff(db, { authorizationUrl, folderId, userId, browserNonce = null }, origin) {
  const target = new URL(authorizationUrl);
  if (target.protocol !== 'https:' || !PROVIDER_HOSTS.has(target.hostname)) throw new Error('Invalid authorization destination');
  const ticket = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  await db.prepare('DELETE FROM android_oauth_handoffs WHERE expires_at < ?').bind(Date.now()).run();
  await db.prepare('INSERT INTO android_oauth_handoffs (ticket_hash, authorization_url, browser_nonce, folder_id, user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await ticketHash(ticket), target.href, browserNonce, String(folderId), String(userId), Date.now() + 600000).run();
  return `${origin}/api/auth/android/start?ticket=${ticket}`;
}

export async function consumeAndroidOAuthHandoff(db, ticket) {
  if (!/^[a-f0-9]{64}$/.test(ticket || '')) return null;
  const handoff = await db.prepare('DELETE FROM android_oauth_handoffs WHERE ticket_hash = ? AND expires_at > ? RETURNING authorization_url, browser_nonce, folder_id, user_id')
    .bind(await ticketHash(ticket), Date.now()).first();
  if (!handoff) return null;
  const target = new URL(handoff.authorization_url);
  if (target.protocol !== 'https:' || !PROVIDER_HOSTS.has(target.hostname)) return null;
  return handoff;
}

export function androidOAuthReturn(origin, folderId, provider, success) {
  const target = new URL('/android-return.html', origin);
  target.search = new URLSearchParams({ folder_id: String(folderId), provider, result: success ? 'success' : 'error' }).toString();
  return target.href;
}
