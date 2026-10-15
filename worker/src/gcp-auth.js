// Google ID tokens for calling a private Cloud Run service (the self-hosted Valhalla) from the
// Worker.  The Worker holds a service-account JSON key (secret GCP_SERVICE_ACCOUNT_KEY) whose
// account has roles/run.invoker on that one service.  Flow (Google's "self-signed JWT ->
// ID token" exchange):
//   1. sign a JWT (RS256) with the key: iss/sub = the service account, aud = token endpoint,
//      target_audience = the Cloud Run URL;
//   2. POST it to oauth2.googleapis.com/token with grant_type jwt-bearer;
//   3. the response's id_token is sent as `Authorization: Bearer ...` to Cloud Run.
// Tokens live 1 hour; they are cached per isolate and refreshed 5 minutes early.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const tokenCache = new Map(); // audience -> { token, expiresAt }

function base64UrlFromBytes(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromJson(value) {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8(pem) {
  const body = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function parseServiceAccountKey(raw) {
  if (!raw) return null;
  let key = raw;
  if (typeof raw === 'string') {
    try {
      key = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!key || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') return null;
  return key;
}

export async function signServiceAccountJwt(key, audience, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'RS256', typ: 'JWT' };
  if (key.private_key_id) header.kid = key.private_key_id;
  const claims = {
    iss: key.client_email,
    sub: key.client_email,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    target_audience: audience
  };
  const unsigned = `${base64UrlFromJson(header)}.${base64UrlFromJson(claims)}`;
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(key.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

/**
 * Returns an ID token for `audience` (the Cloud Run service URL), or null when no usable
 * service-account key is configured.  Throws if Google refuses the exchange.
 */
export async function getIdToken(env, audience, timeoutMs = 8000) {
  const key = parseServiceAccountKey(env && env.GCP_SERVICE_ACCOUNT_KEY);
  if (!key) return null;
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAt - 5 * 60 * 1000 > Date.now()) return cached.token;

  const assertion = await signServiceAccountJwt(key, audience);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.id_token !== 'string') {
      const error = new Error(`Google token exchange failed: HTTP ${response.status}${payload.error ? ` ${payload.error}` : ''}`);
      error.status = response.status;
      throw error;
    }
    tokenCache.set(audience, { token: payload.id_token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return payload.id_token;
  } finally {
    clearTimeout(timer);
  }
}

/** Test helper: forget cached tokens. */
export function clearIdTokenCache() {
  tokenCache.clear();
}
