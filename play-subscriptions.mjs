const PRODUCT_ID = 'multipost_pro';
const BASE_PLANS = new Set(['monthly', 'yearly']);
const PACKAGE_NAME = 'uk.co.multipostapp';
const PLAY_STATES_WITH_ACCESS = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED'
]);

const bytes = (value) => new TextEncoder().encode(value);
const b64 = (value) => btoa(String.fromCharCode(...new Uint8Array(value)));
const b64url = (value) => b64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const unb64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export async function sha256Hex(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(value)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function obfuscatedAccountId(firebaseUid) {
  return sha256Hex(`multipost:${firebaseUid}`);
}

export function interpretPlaySubscription(data, expectedAccountId, now = Date.now()) {
  const lines = Array.isArray(data?.lineItems) ? data.lineItems : [];
  const matching = lines.filter((item) => item.productId === PRODUCT_ID && BASE_PLANS.has(item.offerDetails?.basePlanId));
  if (!matching.length || data?.externalAccountIdentifiers?.obfuscatedExternalAccountId !== expectedAccountId) {
    throw new Error('Purchase product or account does not match');
  }
  const line = matching.reduce((latest, item) => Date.parse(item.expiryTime) > Date.parse(latest.expiryTime) ? item : latest);
  const expiry = Math.floor(Date.parse(line.expiryTime) / 1000);
  if (!Number.isFinite(expiry)) throw new Error('Purchase expiry is invalid');
  const state = String(data.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED');
  return {
    productId: PRODUCT_ID,
    basePlanId: line.offerDetails.basePlanId,
    state,
    expiry,
    needsAcknowledgement: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
    access: PLAY_STATES_WITH_ACCESS.has(state) && expiry * 1000 > now
  };
}

async function googleAccessToken(serviceAccount, fetcher) {
  if (serviceAccount?.type !== 'service_account' || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Google Play service account is not configured');
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = b64url(bytes(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(bytes(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600
  })));
  const key = await crypto.subtle.importKey('pkcs8', unb64(serviceAccount.private_key.replace(/-----[^-]+-----|\s/g, '')), {
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'
  }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, bytes(`${header}.${claims}`));
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(signature)}` })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error('Google Play authentication failed');
  return result.access_token;
}

export async function verifyPlayPurchase({ token, firebaseUid, serviceAccountJson, fetcher = fetch, now = Date.now() }) {
  if (!token || typeof token !== 'string' || token.length > 4096 || !firebaseUid) throw new Error('Invalid purchase token');
  const account = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const bearer = await googleAccessToken(account, fetcher);
  const response = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${bearer}` }
  });
  if (!response.ok) throw new Error('Google Play purchase verification failed');
  const verified = interpretPlaySubscription(await response.json(), await obfuscatedAccountId(firebaseUid), now);
  if (verified.access && verified.needsAcknowledgement) {
    const ack = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${PRODUCT_ID}/tokens/${encodeURIComponent(token)}:acknowledge`, {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: '{}'
    });
    if (!ack.ok) throw new Error('Google Play acknowledgment failed');
  }
  return verified;
}

async function encryptionKey(base64Key) {
  if (!base64Key) throw new Error('Play token encryption key is not configured');
  const raw = unb64(base64Key);
  if (raw.length !== 32) throw new Error('Play token encryption key must be 32 bytes');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptPurchaseToken(token, base64Key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(base64Key), bytes(token));
  return `${b64(iv)}:${b64(encrypted)}`;
}

export async function decryptPurchaseToken(stored, base64Key) {
  const [iv, ciphertext] = String(stored || '').split(':');
  if (!iv || !ciphertext) throw new Error('Invalid stored purchase token');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await encryptionKey(base64Key), unb64(ciphertext));
  return new TextDecoder().decode(decrypted);
}
