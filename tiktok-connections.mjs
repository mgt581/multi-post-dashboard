// All linkage is derived from a verified identity and a server-side OAuth transaction.
export function matchesIdentity(userId, identity) {
  return Boolean(identity && (userId === identity.userId ||
    (identity.emailVerified && userId.toLowerCase() === identity.email.toLowerCase())));
}
export async function ownedFolder(db, folderId, userId) {
  return db.prepare('SELECT id FROM folders WHERE id = ? AND user_id = ?').bind(String(folderId), String(userId)).first();
}
export async function beginTikTokLink(db, { folderId, userId, identity, authBase, clientKey, redirectUri }) {
  if (!matchesIdentity(userId, identity)) throw new Error('Sign in again before connecting TikTok.');
  if (!await ownedFolder(db, folderId, userId)) throw new Error('Workspace not found.');
  const state = `ttlink_${crypto.randomUUID()}`;
  const browserNonce = crypto.randomUUID();
  await db.prepare('DELETE FROM tiktok_oauth_states WHERE expires_at < ?').bind(Date.now()).run();
  await db.prepare('INSERT INTO tiktok_oauth_states (state, browser_nonce, folder_id, user_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(state, browserNonce, String(folderId), userId, Date.now() + 600000).run();
  const url = new URL(`${authBase}/v2/auth/authorize/`);
  url.search = new URLSearchParams({ client_key: clientKey, response_type: 'code',
    scope: 'video.upload,video.publish,user.info.basic', redirect_uri: redirectUri, state,
    disable_auto_auth: '1' }).toString();
  return { url: url.href, state, browserNonce };
}
export async function consumeTikTokLink(db, state, browserNonce) {
  if (!state.startsWith('ttlink_') || !browserNonce) throw new Error('TikTok connection expired. Start again from your workspace.');
  // Atomic consume: retries and parallel callbacks cannot reuse a code/state.
  const link = await db.prepare('DELETE FROM tiktok_oauth_states WHERE state = ? AND browser_nonce = ? AND expires_at > ? RETURNING folder_id, user_id')
    .bind(state, browserNonce, Date.now()).first();
  if (!link || !await ownedFolder(db, link.folder_id, link.user_id)) throw new Error('TikTok connection expired or workspace was removed.');
  return link;
}
export async function saveTikTokConnection(db, { folderId, userId, openId, nickname, avatar, accessToken, refreshToken, expiresAt, scope }) {
  if (!openId || !accessToken) throw new Error('TikTok did not return a valid account and access token.');
  if (!await ownedFolder(db, folderId, userId)) throw new Error('Workspace not found.');
  // Replace only this folder's link, keeping every other folder/account intact.
  await db.batch([
    db.prepare("DELETE FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'tiktok'").bind(folderId, userId),
    db.prepare("DELETE FROM tokens WHERE folder_id = ? AND platform = 'tiktok'").bind(folderId),
    db.prepare("INSERT INTO accounts (folder_id, user_id, platform, nickname, access_token, refresh_token, expires_at, profile_picture, tiktok_open_id) VALUES (?, ?, 'tiktok', ?, ?, ?, ?, ?, ?)")
      .bind(folderId, userId, nickname, accessToken, refreshToken || null, expiresAt, avatar || null, openId),
    db.prepare("INSERT INTO tokens (folder_id, platform, account_id, access_token, refresh_token, expires_at, scope, updated_at) VALUES (?, 'tiktok', ?, ?, ?, ?, ?, strftime('%s','now'))")
      .bind(folderId, openId, accessToken, refreshToken || null, expiresAt, scope)
  ]);
}
export async function tikTokPublishingAccount(db, folderId, userId) {
  if (!await ownedFolder(db, folderId, userId)) return null;
  // Never resurrect a disconnected link from a stale token snapshot.
  return db.prepare("SELECT id, nickname, profile_picture, access_token, refresh_token, expires_at, tiktok_open_id FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'tiktok' ORDER BY id DESC LIMIT 1")
    .bind(folderId, userId).first();
}
export async function disconnectTikTok(db, accountId, userId) {
  const account = await db.prepare("SELECT folder_id FROM accounts WHERE id = ? AND user_id = ? AND platform = 'tiktok'").bind(accountId, userId).first();
  if (!account || !await ownedFolder(db, account.folder_id, userId)) return false;
  await db.batch([
    db.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ? AND platform = 'tiktok'").bind(accountId, userId),
    db.prepare("DELETE FROM tokens WHERE folder_id = ? AND platform = 'tiktok'").bind(account.folder_id),
    db.prepare('DELETE FROM tiktok_oauth_states WHERE folder_id = ? AND user_id = ?').bind(String(account.folder_id), userId),
    db.prepare("DELETE FROM upload_sessions WHERE folder_id = ? AND user_id = ? AND platform = 'tiktok'").bind(String(account.folder_id), userId)
  ]);
  return true;
}

// Only the two supported production hosts share the linking nonce. Preview and
// workers.dev cookies remain host-only; never derive Domain from arbitrary input.
export function tikTokLinkCookie(value, maxAge, requestUrl) {
  const host = new URL(requestUrl).hostname;
  const domain = ['multipostapp.co.uk', 'www.multipostapp.co.uk'].includes(host)
    ? '; Domain=multipostapp.co.uk' : '';
  return `mp_tiktok_link_nonce=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax${domain}`;
}
