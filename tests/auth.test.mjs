import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, base64url } from 'jose';
import { createAuthHandler, sealCookie, GOOGLE, SESSION_SECONDS } from '../server/auth.mjs';
import worker from '../server/worker.mjs';
import { readFile } from 'node:fs/promises';

const origin = 'https://postertiler.com';
const env = { AUTH_ORIGIN: origin, GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-only-client-secret', AUTH_COOKIE_KEY: base64url.encode(crypto.getRandomValues(new Uint8Array(32))) };
const config = { origin, key: base64url.decode(env.AUTH_COOKIE_KEY) };
const keys = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...await exportJWK(keys.publicKey), kid: 'fixture-signing-key', alg: 'RS256', use: 'sig' };
const fixtureUser = { id: 'fixture-google-subject', email: 'fixture@example.com', name: 'Test Person' };
const cookiePair = response => response.headers.getSetCookie()[0].split(';')[0];
const req = (path, cookie = '', init = {}) => new Request(origin + path, { ...init, headers: { Cookie: cookie, ...init.headers } });
async function begin(handler) {
  const response = await handler(req('/api/auth/google'), env);
  const url = new URL(response.headers.get('Location'));
  return { response, url, cookie: cookiePair(response), state: url.searchParams.get('state'), nonce: url.searchParams.get('nonce') };
}
function provider(getFlow, overrides = {}, signingKey = keys.privateKey) {
  const calls = []; const used = new Set();
  return { calls, fetch: async (url, options) => {
    calls.push(String(url));
    if (String(url) === GOOGLE.jwks_uri) return Response.json({ keys: [jwk] });
    assert.equal(String(url), GOOGLE.token_endpoint);
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('client_id'), env.GOOGLE_CLIENT_ID);
    assert.equal(body.get('client_secret'), env.GOOGLE_CLIENT_SECRET);
    assert.equal(body.get('redirect_uri'), origin + '/api/auth/callback/google');
    assert.ok(body.get('code_verifier').length >= 43);
    const challenge = base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')))));
    assert.equal(challenge, getFlow().url.searchParams.get('code_challenge'));
    if (used.has(body.get('code'))) return Response.json({ error: 'invalid_grant' }, { status: 400 });
    used.add(body.get('code'));
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ sub: fixtureUser.id, email: fixtureUser.email, name: fixtureUser.name, email_verified: true, nonce: getFlow().nonce, iss: GOOGLE.issuer, aud: env.GOOGLE_CLIENT_ID, iat: now, exp: now + 3600, ...overrides })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(signingKey);
    return Response.json({ access_token: 'fixture-discarded-access-token', token_type: 'Bearer', expires_in: 3600, id_token: idToken });
  } };
}

test('missing server secrets leave sign-in unavailable without exposing configuration', async () => {
  const handler = createAuthHandler();
  const response = await handler(req('/api/auth/session'), {});
  assert.deepEqual(await response.json(), { available: false, user: null, admin:false });
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal((await handler(req('/api/auth/google'), {})).headers.get('Location'), origin + '/account?error=unavailable');
});
test('authorization uses fixed callback, minimal scopes, PKCE and browser-bound encrypted state', async () => {
  const { response, url } = await begin(createAuthHandler());
  assert.equal(url.origin, GOOGLE.issuer); assert.equal(url.pathname, '/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('redirect_uri'), origin + '/api/auth/callback/google');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('nonce').length >= 32); assert.ok(url.searchParams.get('state').length >= 32);
  assert.ok(!url.href.includes(env.GOOGLE_CLIENT_SECRET));
  const cookie = response.headers.get('Set-Cookie');
  assert.match(cookie, /^__Host-postertiler-oauth=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Max-Age=600/);
  assert.ok(!cookie.includes(url.searchParams.get('state')));
});
test('valid signed Google result produces an encrypted session; replay cannot mint another session', async () => {
  let flow; const p = provider(() => flow); const handler = createAuthHandler(p.fetch); flow = await begin(handler);
  const callback = `/api/auth/callback/google?state=${flow.state}&code=single-use-fixture-code`;
  const response = await handler(req(callback, flow.cookie), env);
  assert.equal(response.headers.get('Location'), origin + '/account');
  const cookies = response.headers.getSetCookie(); assert.equal(cookies.length, 2);
  const session = cookies.find(c => c.startsWith('__Host-postertiler-session='));
  assert.match(session, new RegExp(`Max-Age=${SESSION_SECONDS}`)); assert.ok(!session.includes(fixtureUser.email));
  const current = await handler(req('/api/auth/session', session.split(';')[0]), env);
  assert.deepEqual(await current.json(), { available: true, user: fixtureUser, admin:false });
  assert.match(current.headers.get('X-Robots-Tag'), /noindex/);
  assert.ok(!session.includes('access_token'));
  const replay = await handler(req(callback, flow.cookie), env);
  assert.equal(replay.headers.get('Location'), origin + '/account?error=failed');
  assert.ok(!replay.headers.getSetCookie().some(c => c.startsWith('__Host-postertiler-session=')));
});
test('missing, tampered, duplicate or mismatched state never reaches Google token endpoint', async () => {
  const calls = []; const handler = createAuthHandler(async url => { calls.push(url); throw new Error(); });
  const flow = await begin(handler);
  for (const [path, cookie] of [
    [`?state=${flow.state}&code=x`, ''], [`?state=wrong&code=x`, flow.cookie],
    [`?state=${flow.state}&state=${flow.state}&code=x`, flow.cookie],
    [`?state=${flow.state}&code=x`, flow.cookie.slice(0, -4) + 'xxxx'],
  ]) {
    const result = await handler(req('/api/auth/callback/google' + path, cookie), env);
    assert.equal(result.headers.get('Location'), origin + '/account?error=expired');
  }
  assert.deepEqual(calls, []);
});
test('cancel and malformed code responses return safe retry states with no session', async () => {
  const handler = createAuthHandler(); const flow = await begin(handler);
  for (const [query, reason] of [[`state=${flow.state}&error=access_denied`, 'canceled'], [`state=${flow.state}`, 'failed'], [`state=${flow.state}&code=a&code=b`, 'failed']]) {
    const response = await handler(req('/api/auth/callback/google?' + query, flow.cookie), env);
    assert.equal(response.headers.get('Location'), origin + '/account?error=' + reason);
    assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
  }
});
for (const [name, claims] of [
  ['nonce mismatch', { nonce: 'wrong-nonce' }], ['wrong audience', { aud: 'other.apps.googleusercontent.com' }],
  ['wrong issuer', { iss: 'https://attacker.example' }], ['expired token', { exp: 1 }],
  ['unverified email', { email_verified: false }], ['missing subject', { sub: '' }],
]) test(`Google ${name} cannot authenticate`, async () => {
  let flow; const p = provider(() => flow, claims); const handler = createAuthHandler(p.fetch); flow = await begin(handler);
  const response = await handler(req(`/api/auth/callback/google?state=${flow.state}&code=fixture-code`, flow.cookie), env);
  assert.equal(response.headers.get('Location'), origin + '/account?error=failed');
  assert.ok(!response.headers.getSetCookie().some(c => c.startsWith('__Host-postertiler-session=')));
});
test('a JWT with forged signature cannot authenticate even if all identity claims are correct', async () => {
  let flow; const forged = await generateKeyPair('RS256'); const p = provider(() => flow, {}, forged.privateKey); const handler = createAuthHandler(p.fetch); flow = await begin(handler);
  const response = await handler(req(`/api/auth/callback/google?state=${flow.state}&code=forged-fixture`, flow.cookie), env);
  assert.equal(response.headers.get('Location'), origin + '/account?error=failed');
});
test('expired sessions, key rotation, tampering and cookie purpose confusion cannot authenticate', async () => {
  const handler = createAuthHandler(); const name = '__Host-postertiler-session=';
  const valid = await sealCookie(config, 'session', { user: fixtureUser }, SESSION_SECONDS);
  const expired = await sealCookie(config, 'session', { user: fixtureUser }, SESSION_SECONDS, Math.floor(Date.now()/1000) - SESSION_SECONDS - 10);
  const oauth = await sealCookie(config, 'oauth', { user: fixtureUser }, 600);
  for (const token of [expired, valid.slice(0,-4)+'xxxx', oauth]) assert.equal((await (await handler(req('/api/auth/session', name + token), env)).json()).user, null);
  const rotated = { ...env, AUTH_COOKIE_KEY: base64url.encode(crypto.getRandomValues(new Uint8Array(32))) };
  assert.equal((await (await handler(req('/api/auth/session', name + valid), rotated)).json()).user, null);
});
test('sign-out requires same-origin POST and clears only the requested browser session', async () => {
  const handler = createAuthHandler();
  assert.equal((await handler(req('/api/auth/signout'), env)).status, 405);
  for (const suppliedOrigin of [undefined, 'https://attacker.example']) {
    const response = await handler(req('/api/auth/signout', '', { method:'POST', headers:suppliedOrigin ? {Origin:suppliedOrigin} : {} }), env);
    assert.equal(response.status, 403); assert.equal(response.headers.get('Set-Cookie'), null);
  }
  const response = await handler(req('/api/auth/signout', '', { method:'POST', headers:{Origin:origin} }), env);
  assert.equal(response.status, 200); assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
});
test('API host, methods and unknown routes are enforced without reflection or open redirects', async () => {
  const handler = createAuthHandler();
  assert.equal((await handler(new Request('https://attacker.example/api/auth/session'), env)).status, 400);
  assert.equal((await handler(req('/api/auth/session','',{method:'POST'}), env)).status, 405);
  assert.equal((await handler(req('/api/unknown'), env)).status, 404);
  const response = await handler(req('/api/auth/google?returnTo=https://attacker.example'), env);
  assert.equal(new URL(response.headers.get('Location')).searchParams.get('redirect_uri'), origin+'/api/auth/callback/google');
});
test('account HTML is private and noindex while ordinary tool assets bypass authentication', async () => {
  const assets = { fetch:async () => new Response('static fixture', { headers:{'Content-Security-Policy':"default-src 'self'"} }) };
  const account = await worker.fetch(req('/account'), { ...env, ASSETS:assets });
  assert.equal(account.status,200); assert.match(account.headers.get('Cache-Control'),/no-store/); assert.match(account.headers.get('X-Robots-Tag'),/noindex/);
  assert.equal(account.headers.get('Content-Security-Policy'), "default-src 'self'");
  const ordinary = await worker.fetch(req('/tools'), { ASSETS:assets }); assert.equal(await ordinary.text(),'static fixture');
});
test('account is rendered but excluded from public Sitemap and permanently noindex', async () => {
  const html = await readFile('dist/account.html','utf8'), map = await readFile('dist/sitemap.xml','utf8');
  assert.ok(html.includes('noindex,nofollow')); assert.ok(!map.includes('/account'));
});
test('OAuth returns to an allowlisted workspace destination and rejects external redirects',async()=>{
 for(const target of ['/cloud','/account/tasks','/account/billing?plan=pack5','https://evil.invalid/','//evil.invalid/','/account/billing?plan=unknown','/cloud?next=https://evil.invalid']){
  let flow;const transport=provider(()=>flow),handler=createAuthHandler(transport.fetch);
  const response=await handler(req('/api/auth/google?return_to='+encodeURIComponent(target)),env),url=new URL(response.headers.get('Location'));
  flow={response,url,cookie:cookiePair(response),state:url.searchParams.get('state'),nonce:url.searchParams.get('nonce')};
  const result=await handler(req('/api/auth/callback/google?code='+crypto.randomUUID()+'&state='+flow.state,flow.cookie),env);
  const expected=['/cloud','/account/tasks','/account/billing?plan=pack5'].includes(target)?target:'/account';assert.equal(result.headers.get('Location'),origin+expected);
 }
});
test('all account subpages and the cloud workspace are private and absent from public Sitemap',async()=>{
 const assets={fetch:async()=>new Response('private fixture')};const map=await readFile('dist/sitemap.xml','utf8');
 for(const path of ['/cloud','/account/tasks','/account/billing','/account/settings']){
  const response=await worker.fetch(req(path),{...env,ASSETS:assets});assert.match(response.headers.get('Cache-Control'),/no-store/);assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  const html=await readFile('dist'+path+'.html','utf8');assert.ok(html.includes('noindex,nofollow'));assert.ok(!map.includes(origin+path));
 }
});
