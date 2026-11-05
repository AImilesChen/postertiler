import * as oauth from 'oauth4webapi';
import { EncryptJWT, jwtDecrypt, base64url } from 'jose';

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const FLOW_SECONDS = 10 * 60;
export const GOOGLE = Object.freeze({
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
});
const CALLBACK = '/api/auth/callback/google';
const privateHeaders = {
  'Cache-Control': 'private, no-store', 'Pragma': 'no-cache',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

function settings(env) {
  const origin = new URL(env.AUTH_ORIGIN || 'https://postertiler.com').origin;
  const url = new URL(origin);
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('Invalid authentication origin');
  let key;
  try { key = base64url.decode(env.AUTH_COOKIE_KEY || ''); } catch { /* Not configured. */ }
  const available = typeof env.GOOGLE_CLIENT_ID === 'string' && env.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com') &&
    typeof env.GOOGLE_CLIENT_SECRET === 'string' && env.GOOGLE_CLIENT_SECRET.length > 10 && key?.length === 32;
  return { origin, local, key, available, client: { client_id: env.GOOGLE_CLIENT_ID, id_token_signed_response_alg: 'RS256' } };
}
function cookieName(config, purpose) { return `${config.local ? 'postertiler-dev-' : '__Host-postertiler-'}${purpose}`; }
function readCookie(request, name) {
  const parts = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).filter(s => s.startsWith(name + '='));
  return parts.length === 1 ? parts[0].slice(name.length + 1) : null;
}
export async function getSessionUser(request, env) {
  let config;
  try { config = settings(env); } catch { return null; }
  if (!config.available) return null;
  const session = await openCookie(config, 'session', readCookie(request, cookieName(config, 'session')));
  const user = session?.user;
  return user && typeof user.id === 'string' && typeof user.email === 'string' ? user : null;
}
function cookie(config, purpose, value, maxAge) {
  return `${cookieName(config, purpose)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.local ? '' : '; Secure'}`;
}
export async function sealCookie(config, purpose, payload, age, now = Math.floor(Date.now() / 1000)) {
  return new EncryptJWT(payload).setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
    .setIssuer(config.origin).setAudience(purpose).setIssuedAt(now).setExpirationTime(now + age).encrypt(config.key);
}
async function openCookie(config, purpose, value) {
  if (!value || value.length > 4096 || !config.key) return null;
  try {
    const { payload } = await jwtDecrypt(value, config.key, {
      issuer: config.origin, audience: purpose, keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
      requiredClaims: ['iat', 'exp', 'iss', 'aud'], maxTokenAge: purpose === 'oauth' ? FLOW_SECONDS : SESSION_SECONDS,
    });
    return payload;
  } catch { return null; }
}
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
}
function redirect(config, path, cookies = []) {
  const headers = new Headers({ ...privateHeaders, Location: new URL(path, config.origin).href });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

// Test transports cannot be configured through production bindings or request parameters.
export async function completeGoogle(config, env, url, flow, transport) {
  const params = oauth.validateAuthResponse(GOOGLE, config.client, url, flow.state);
  const options = { signal: AbortSignal.timeout(10000), ...(transport ? { [oauth.customFetch]: transport } : {}) };
  const response = await oauth.authorizationCodeGrantRequest(GOOGLE, config.client,
    oauth.ClientSecretPost(env.GOOGLE_CLIENT_SECRET), params, config.origin + CALLBACK, flow.verifier, options);
  const result = await oauth.processAuthorizationCodeResponse(GOOGLE, config.client, response, {
    expectedNonce: flow.nonce, requireIdToken: true,
  });
  await oauth.validateApplicationLevelSignature(GOOGLE, response, options);
  const claims = oauth.getValidatedIdTokenClaims(result);
  if (!claims || claims.email_verified !== true || typeof claims.email !== 'string' || claims.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) {
    throw new Error('Verified Google identity required');
  }
  return { id: claims.sub, email: claims.email, name: typeof claims.name === 'string' ? claims.name.slice(0, 120) : '' };
}

export function createAuthHandler(transport) {
  return async function handleAuth(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return null;
    let config;
    try { config = settings(env); } catch { return json({ error: 'unavailable' }, 503); }
    if (url.origin !== config.origin) return json({ error: 'invalid_origin' }, 400);
    const is = path => url.pathname === '/api/auth/' + path;
    const allowedMethod = is('signout') ? 'POST' : 'GET';
    if (!['session', 'google', 'callback/google', 'signout'].some(is)) return json({ error: 'not_found' }, 404);
    if (request.method !== allowedMethod) return json({ error: 'method_not_allowed' }, 405, { Allow: allowedMethod });
    if (is('session')) {
      const session = config.available ? await openCookie(config, 'session', readCookie(request, cookieName(config, 'session'))) : null;
      const user = session?.user;
      return json({ available: config.available, user: user && typeof user.id === 'string' && typeof user.email === 'string' ? user : null });
    }
    if (is('signout')) {
      if (request.headers.get('Origin') !== config.origin) return json({ error: 'invalid_origin' }, 403);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(config, 'session', '', 0) });
    }
    const clearFlow = cookie(config, 'oauth', '', 0);
    if (!config.available) return redirect(config, '/account?error=unavailable', [clearFlow]);
    if (is('google')) {
      const flow = { state: oauth.generateRandomState(), nonce: oauth.generateRandomNonce(), verifier: oauth.generateRandomCodeVerifier() };
      const destination = new URL(GOOGLE.authorization_endpoint);
      for (const [name, value] of Object.entries({ client_id: config.client.client_id, redirect_uri: config.origin + CALLBACK,
        response_type: 'code', scope: 'openid email profile', state: flow.state, nonce: flow.nonce,
        code_challenge: await oauth.calculatePKCECodeChallenge(flow.verifier), code_challenge_method: 'S256', prompt: 'select_account' })) destination.searchParams.set(name, value);
      const token = await sealCookie(config, 'oauth', flow, FLOW_SECONDS);
      const response = redirect(config, '/account', [cookie(config, 'oauth', token, FLOW_SECONDS)]);
      response.headers.set('Location', destination.href);
      return response;
    }
    const flow = await openCookie(config, 'oauth', readCookie(request, cookieName(config, 'oauth')));
    if (!flow || typeof flow.state !== 'string' || typeof flow.nonce !== 'string' || typeof flow.verifier !== 'string' ||
        url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== flow.state) {
      return redirect(config, '/account?error=expired', [clearFlow]);
    }
    if (url.searchParams.has('error')) return redirect(config, '/account?error=canceled', [clearFlow]);
    if (url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code') || url.searchParams.get('code').length > 4096) {
      return redirect(config, '/account?error=failed', [clearFlow]);
    }
    try {
      const user = await completeGoogle(config, env, url, flow, transport);
      const session = await sealCookie(config, 'session', { user }, SESSION_SECONDS);
      return redirect(config, '/account', [clearFlow, cookie(config, 'session', session, SESSION_SECONDS)]);
    } catch {
      // OAuth responses can contain codes, tokens and private claims. Never log them.
      return redirect(config, '/account?error=failed', [clearFlow]);
    }
  };
}

export const handleAuth = createAuthHandler();
