const PRODUCT_ID = 'multipost_pro';
const BASE_PLANS = new Set(['monthly', 'yearly']);
export const WORKSPACE_PRODUCT_IDS = Array.from({ length: 10 }, (_, index) => `multipost_workspace_${String(index + 1).padStart(2, '0')}`);
const WORKSPACE_PRODUCTS = new Set(WORKSPACE_PRODUCT_IDS);
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
  const hasPaidProLine = matching.some((item) => item.latestSuccessfulOrderId);
  const current = matching.filter((item) => (!hasPaidProLine || item.latestSuccessfulOrderId) &&
    Number.isFinite(Date.parse(item.expiryTime)) && Date.parse(item.expiryTime) > now);
  // A deferred replacement without an expiry/order is not an entitlement.
  const line = (current.length ? current : matching.filter((item) => !hasPaidProLine || item.latestSuccessfulOrderId)).reduce((latest, item) =>
    Date.parse(item.expiryTime || 0) > Date.parse(latest.expiryTime || 0) ? item : latest);
  const expiry = Math.floor(Date.parse(line.expiryTime) / 1000);
  if (!Number.isFinite(expiry)) throw new Error('Purchase expiry is invalid');
  const state = String(data.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED');
  const access = PLAY_STATES_WITH_ACCESS.has(state) && expiry * 1000 > now;
  const workspaceLines = lines.filter((item) => item.productId?.startsWith('multipost_workspace'));
  if (workspaceLines.some((item) => !WORKSPACE_PRODUCTS.has(item.productId)) ||
      new Set(workspaceLines.map((item) => item.productId)).size !== workspaceLines.length) {
    throw new Error('Workspace catalogue contains an unknown or duplicate product');
  }
  const workspaceItems = access && data.regionCode !== 'KR' ? workspaceLines.filter((item) =>
    item.latestSuccessfulOrderId && item.offerDetails?.basePlanId === line.offerDetails.basePlanId &&
    Number.isFinite(Date.parse(item.expiryTime)) && Date.parse(item.expiryTime) > now)
    .map((item) => ({ productId: item.productId, expiry: Math.floor(Date.parse(item.expiryTime) / 1000),
      renewing: item.autoRenewingPlan?.autoRenewEnabled === true })) : [];
  const workspaceQuantity = workspaceItems.length;
  return {
    productId: PRODUCT_ID,
    basePlanId: line.offerDetails.basePlanId,
    state,
    expiry,
    workspaceQuantity,
    workspaceExpiry: workspaceQuantity ? Math.max(...workspaceItems.map((item) => item.expiry)) : null,
    workspaceItems,
    linkedPurchaseToken: data.linkedPurchaseToken || null,
    trialEnd: line.offerPhase?.freeTrial && ['trial-7d-monthly', 'trial-7d-yearly'].includes(line.offerDetails?.offerId) ? expiry : null,
    proOrderId: line.latestSuccessfulOrderId || null,
    needsAcknowledgement: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
    access
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

const positiveMoney = (money) => {
  const units = Number(money?.units || 0);
  const nanos = Number(money?.nanos || 0);
  return Number.isFinite(units) && Number.isFinite(nanos) && (units > 0 || (units === 0 && nanos > 0));
};

export async function verifyPlayPurchase({ token, firebaseUid, serviceAccountJson, previousPaidOrderId = null, fetcher = fetch, now = Date.now() }) {
  if (!token || typeof token !== 'string' || token.length > 4096 || !firebaseUid) throw new Error('Invalid purchase token');
  const account = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const bearer = await googleAccessToken(account, fetcher);
  const response = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${bearer}` }
  });
  if (!response.ok) throw new Error('Google Play purchase verification failed');
  const verified = interpretPlaySubscription(await response.json(), await obfuscatedAccountId(firebaseUid), now);
  // A trial can have a successful zero-value order. Check the actual Pro line
  // charge, and retain an earlier paid order when an add-on creates a new
  // zero-value KEEP_EXISTING Pro line. An unavailable order API locks only
  // add-on eligibility; it must not interrupt the verified Pro subscription.
  const candidateOrderIds = [...new Set([verified.proOrderId, previousPaidOrderId].filter(Boolean))];
  verified.paidProOrderId = null;
  if (!verified.trialEnd && verified.access) {
    for (const orderId of candidateOrderIds) {
      try {
        const orderResponse = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/orders/${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${bearer}` }
        });
        if (!orderResponse.ok) continue;
        const order = await orderResponse.json();
        if (order.orderId === orderId && order.state === 'PROCESSED' &&
            order.lineItems?.some((item) => item.productId === PRODUCT_ID && positiveMoney(item.total))) {
          verified.paidProOrderId = orderId;
          break;
        }
      } catch (_) { /* Missing order evidence never unlocks add-on purchases. */ }
    }
  }
  verified.paidPro = Boolean(verified.paidProOrderId);
  if (!verified.paidPro) {
    verified.workspaceItems = [];
    verified.workspaceQuantity = 0;
    verified.workspaceExpiry = null;
  }
  if (verified.access && verified.needsAcknowledgement) {
    const ack = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${PRODUCT_ID}/tokens/${encodeURIComponent(token)}:acknowledge`, {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: '{}'
    });
    if (!ack.ok) throw new Error('Google Play acknowledgment failed');
  }
  return verified;
}

/**
 * A standalone extra-workspace subscription (its own purchase token). Some Play
 * Store builds reject add-on lines on the Pro token, so Android 1.9.7+ buys
 * each extra workspace as a normal subscription instead.
 */
export function interpretWorkspaceSubscription(data, expectedAccountId, now = Date.now()) {
  const lines = Array.isArray(data?.lineItems) ? data.lineItems : [];
  if (lines.length !== 1 || !WORKSPACE_PRODUCTS.has(lines[0]?.productId) ||
      !BASE_PLANS.has(lines[0]?.offerDetails?.basePlanId) ||
      data?.externalAccountIdentifiers?.obfuscatedExternalAccountId !== expectedAccountId) {
    throw new Error('Workspace purchase product or account does not match');
  }
  const line = lines[0];
  const expiry = Math.floor(Date.parse(line.expiryTime) / 1000);
  if (!Number.isFinite(expiry)) throw new Error('Workspace purchase expiry is invalid');
  const state = String(data.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED');
  return {
    productId: line.productId,
    basePlanId: line.offerDetails.basePlanId,
    state,
    expiry,
    renewing: line.autoRenewingPlan?.autoRenewEnabled === true,
    orderId: line.latestSuccessfulOrderId || null,
    needsAcknowledgement: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
    // A workspace counts only once Google reports a successful paid order.
    access: PLAY_STATES_WITH_ACCESS.has(state) && expiry * 1000 > now && Boolean(line.latestSuccessfulOrderId) &&
      data.regionCode !== 'KR'
  };
}

export async function verifyPlayWorkspacePurchase({ token, firebaseUid, serviceAccountJson, fetcher = fetch, now = Date.now() }) {
  if (!token || typeof token !== 'string' || token.length > 4096 || !firebaseUid) throw new Error('Invalid purchase token');
  const account = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const bearer = await googleAccessToken(account, fetcher);
  const response = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${bearer}` }
  });
  if (!response.ok) throw new Error('Google Play workspace verification failed');
  const verified = interpretWorkspaceSubscription(await response.json(), await obfuscatedAccountId(firebaseUid), now);
  if (verified.access && verified.needsAcknowledgement) {
    const ack = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${verified.productId}/tokens/${encodeURIComponent(token)}:acknowledge`, {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: '{}'
    });
    if (!ack.ok) throw new Error('Google Play workspace acknowledgment failed');
  }
  return verified;
}

/** Stops renewal of a standalone workspace subscription; access lasts until its paid expiry. */
export async function cancelPlayWorkspaceSubscription({ token, productId, serviceAccountJson, fetcher = fetch }) {
  if (!WORKSPACE_PRODUCTS.has(productId)) throw new Error('Unknown workspace product');
  const account = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const bearer = await googleAccessToken(account, fetcher);
  const response = await fetcher(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(token)}:cancel`, {
    method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: '{}'
  });
  if (!response.ok) throw new Error('Google Play workspace cancellation failed');
  return true;
}

async function encryptionKey(base64Key) {
  if (!base64Key) throw new Error('Play token encryption key is not configured');
  // Deployment secrets may encode the same 256-bit key as hex or base64.
  const raw = /^[0-9a-f]{64}$/i.test(base64Key)
    ? Uint8Array.from(base64Key.match(/../g), (byte) => parseInt(byte, 16))
    : unb64(base64Key);
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
