import { matchesIdentity, ownedFolder } from './tiktok-connections.mjs';
const platforms = new Set(['facebook', 'youtube']);
export async function beginPlatformLink(db, { platform, folderId, userId, identity }) {
  if (!platforms.has(platform) || !matchesIdentity(userId, identity)) throw new Error('Sign in again before connecting this platform.');
  if (!await ownedFolder(db, folderId, userId)) throw new Error('Workspace not found.');
  const state = `${platform}link_${crypto.randomUUID()}`;
  const browserNonce = crypto.randomUUID();
  // Reuse the existing OAuth transaction table; no production migration required.
  await db.prepare('DELETE FROM tiktok_oauth_states WHERE expires_at < ?').bind(Date.now()).run();
  await db.prepare('INSERT INTO tiktok_oauth_states (state, browser_nonce, folder_id, user_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(state, browserNonce, String(folderId), userId, Date.now() + 600000).run();
  return { state, browserNonce };
}
export async function consumePlatformLink(db, platform, state, browserNonce) {
  if (!platforms.has(platform) || !state.startsWith(`${platform}link_`) || !browserNonce) throw new Error('Connection expired. Start again from your workspace.');
  const link = await db.prepare('DELETE FROM tiktok_oauth_states WHERE state = ? AND browser_nonce = ? AND expires_at > ? RETURNING folder_id, user_id')
    .bind(state, browserNonce, Date.now()).first();
  if (!link || !await ownedFolder(db, link.folder_id, link.user_id)) throw new Error('Connection expired or workspace was removed.');
  return link;
}
export function platformLinkCookie(platform, value, requestUrl) {
  if (!platforms.has(platform)) throw new Error('Unsupported platform');
  const host = new URL(requestUrl).hostname;
  const domain = ['multipostapp.co.uk', 'www.multipostapp.co.uk'].includes(host) ? '; Domain=multipostapp.co.uk' : '';
  return `mp_${platform}_link_nonce=${encodeURIComponent(value)}; Max-Age=600; Path=/api/auth; HttpOnly; Secure; SameSite=Lax${domain}`;
}
