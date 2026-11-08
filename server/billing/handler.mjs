import Stripe from 'stripe';
import {q as opsQuery,ready as opsReady} from '../operations/core.mjs';
import { getSessionUser } from '../auth.mjs';
import { TEST_CATALOG, validTestPrice } from './catalog.mjs';
import { BillingStore, ORDER_FILTERS } from './store.mjs';
import { listingParams } from '../listing.mjs';
import { cloudReady } from '../cloud/contract.mjs';
import { CloudStore } from '../cloud/store.mjs';
import { AI_PACKS,aiReady,aiAllowed } from '../ai/contract.mjs';
import { AiStore } from '../ai/store.mjs';

const BASE = '/api/billing/test';
const EVENTS = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded']);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
function ready(env) {
  return /^(sk|rk)_test_[A-Za-z0-9]+$/.test(env.STRIPE_TEST_SECRET_KEY || '') &&
    /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_TEST_WEBHOOK_SECRET || '') && !!env.BILLING_TEST_DB?.prepare;
}
function origin(env) {
  const url = new URL(env.AUTH_ORIGIN || 'https://postertiler.com');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname))) throw new Error('Invalid origin');
  return url.origin;
}
async function readBody(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) throw new Error('Payload too large');
  const reader = request.body?.getReader(); if (!reader) return '';
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('Payload too large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
async function ownerKey(user) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('google:' + user.id))), byte => byte.toString(16).padStart(2,'0')).join('');
}
const objectId = value => typeof value === 'string' ? value : value?.id;
function validateSession(session, order) {
  const item = session.line_items?.data?.[0];
  const inline=Object.values(AI_PACKS).some(p=>p.price===order.price_id&&p.amount===order.amount&&p.credits===order.credits);
  const priceMatches=inline?item?.price?.unit_amount===order.amount&&item.price.currency===order.currency&&!item.price.recurring&&item.price.type==='one_time':objectId(item?.price)===order.price_id;
  return session.livemode === false && session.mode === 'payment' && session.currency === order.currency &&
    session.amount_subtotal === order.amount && session.amount_total === order.amount &&
    session.metadata?.order_id === order.id && session.metadata?.sku === order.sku &&
    session.metadata?.price_version === order.price_version && session.client_reference_id === order.user_key &&
    (!order.session_id || order.session_id === session.id) && session.line_items?.data?.length === 1 &&
    session.line_items.has_more === false && item.quantity === 1 && priceMatches;
}
function safeCheckoutUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' ? url.href : null; } catch { return null; }
}
function stripeClient(env) {
  return new Stripe(env.STRIPE_TEST_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(), timeout: 10000, maxNetworkRetries: 1 });
}
function safeFailure(error) {
  if (error?.type === 'StripeAuthenticationError') return 'stripe_authentication_failed';
  if (error?.type === 'StripePermissionError') return 'stripe_permission_denied';
  if (error?.code === 'resource_missing') return 'stripe_resource_not_found';
  if (error?.type === 'StripeInvalidRequestError') return 'stripe_request_rejected';
  if (error?.type === 'StripeConnectionError' || error?.type === 'StripeAPIError') return 'stripe_temporarily_unavailable';
  return 'billing_temporarily_unavailable';
}
function checkoutSetupReason(error, env) {
  // Only setup validation errors are shown in the sandbox. Strip known Secrets,
  // URLs, emails and opaque identifiers before exposing a short actionable reason.
  if (error?.type !== 'StripeInvalidRequestError' || typeof error.message !== 'string') return undefined;
  let reason = error.message;
  for (const secret of [env.STRIPE_TEST_SECRET_KEY,env.STRIPE_TEST_WEBHOOK_SECRET]) if (secret) reason = reason.split(secret).join('[redacted]');
  return reason.replace(/(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+/g,'[redacted]')
    .replace(/https?:\/\/\S+/g,'[Stripe Dashboard]').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'[redacted email]')
    .replace(/[A-Za-z0-9_-]{24,}/g,'[redacted identifier]').slice(0,280);
}

// Injected transports exist only for tests; request parameters and bindings
// cannot replace the Stripe API or authentication provider.
export function createBillingHandler({ makeStripe = stripeClient, authenticate = getSessionUser,ai=false } = {}) {
  const base=ai?'/api/ai/test/billing':BASE,catalog=ai?AI_PACKS:TEST_CATALOG;
  return async function handleBilling(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== base && !url.pathname.startsWith(base + '/')) return null;
    const path = url.pathname.slice(base.length);
    const orderPath = path.match(/^\/orders\/([0-9a-f-]+)$/i);
    if (!['/status','/checkout','/webhook','/orders'].includes(path) && !orderPath) return json({ error: 'not_found' }, 404);
    const method = ['/checkout','/webhook'].includes(path) ? 'POST' : 'GET';
    if (request.method !== method) return json({ error: 'method_not_allowed' }, 405, { Allow: method });
    let operation = 'configuration';
    try {
      if (url.origin !== origin(env)) return json({ error: 'invalid_origin' }, 400);
      if (path === '/webhook') return await webhook(request, env, makeStripe);
      const user = await authenticate(request, env);
      if (!user) return json({ error: 'sign_in_required' }, 401);
      if(ai&&!aiAllowed(user,env))return json({error:'pilot_access_required'},403);
      if (path === '/status') {
        operation = 'database';
        const enabled = env.BILLING_TEST_ENABLED === 'true' && ready(env) && (!ai||aiReady(env));
        const summary = enabled ? await new BillingStore(env.BILLING_TEST_DB,{ai}).summary(await ownerKey(user)) : { test_credits: 0, orders: [] };
        const cloud = !ai && enabled && cloudReady(env);
        if(cloud) summary.test_credits=(await new CloudStore(env.BILLING_TEST_DB).balance(await ownerKey(user))).available;
        if(ai&&enabled)summary.test_credits=(await new AiStore(env.BILLING_TEST_DB).balance(await ownerKey(user))).available;
        return json({ mode: 'test', enabled, cloud_delivery: cloud, ...summary, plans: Object.entries(catalog).map(([id, plan]) => ({ id, name: plan.name, amount: plan.amount, currency: plan.currency, credits: plan.credits })) });
      }
      if (env.BILLING_TEST_ENABLED !== 'true' || !ready(env)||ai&&!aiReady(env)) return json({ error: 'test_billing_unavailable' }, 503);
      operation = 'database';
      const store = new BillingStore(env.BILLING_TEST_DB,{ai}), userKey = await ownerKey(user);
      if(path === '/orders') {
        const params=listingParams(url,ORDER_FILTERS);if(!params)return json({error:'invalid_request'},400);
        return json(await store.listPage(userKey,params));
      }
      if (orderPath) {
        if (!uuid(orderPath[1])) return json({ error: 'not_found' }, 404);
        const row = await store.find(orderPath[1]);
        if (!row || row.user_key !== userKey) return json({ error: 'not_found' }, 404);
        // A browser return only reads persisted webhook state; it never grants credits.
        return json({ id: row.id, status: row.status, sku: row.sku, amount: row.amount, currency: row.currency, test_credits: row.paid ? row.credits - row.refunded_credits : 0 });
      }
      if (request.headers.get('Origin') !== origin(env)) return json({ error: 'invalid_origin' }, 403);
      if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return json({ error: 'invalid_content_type' }, 415);
      let body;
      try { body = JSON.parse(await readBody(request, 4096)); } catch { return json({ error: 'invalid_request' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['plan','request_id'].includes(key)) || !Object.hasOwn(catalog, body.plan) || !uuid(body.request_id)) return json({ error: 'invalid_request' }, 400);
      const plan = catalog[body.plan];
      let order = await store.findRequest(userKey, body.request_id);
      if (order && order.sku !== body.plan) return json({ error: 'request_conflict' }, 409);
      if (!order && await store.recentCount(userKey) >= 10) return json({ error: 'too_many_attempts' }, 429, { 'Retry-After': '3600' });
      const stripe = makeStripe(env);
      if (!order) {
        operation = 'stripe_price';
        if(!plan.inline){const price = await stripe.prices.retrieve(plan.price);
        if (!validTestPrice(price, plan)) return json({ error: 'price_configuration_mismatch' }, 503);}
        operation = 'database';
        order = await store.create(userKey, body.request_id, body.plan, plan);
        if (order.sku !== body.plan) return json({ error: 'request_conflict' }, 409);
      }
      if (order.paid || ['expired','failed'].includes(order.status)) return json({ error: 'order_not_payable', order_id: order.id }, 409);
      // Stripe retains idempotency results for at least 24 hours. Never reuse an
      // unattached request beyond that window after an uncertain API response.
      if (!order.session_id && Date.now() - order.created_at > 23 * 3600000) return json({ error: 'request_expired' }, 409);
      operation = 'stripe_checkout';
      const session = order.session_id ? await stripe.checkout.sessions.retrieve(order.session_id) : await stripe.checkout.sessions.create({
        mode: 'payment', line_items: [plan.inline?{price_data:{currency:order.currency,unit_amount:order.amount,product_data:{name:plan.name}},quantity:1}:{ price: order.price_id, quantity: 1 }], allowed_payment_method_types: ['card'],
        client_reference_id: order.user_key, metadata: { order_id: order.id, sku: order.sku, price_version: order.price_version,...(ai?{billing_scope:'ai'}:{}) },
        payment_intent_data: { metadata: { order_id: order.id,...(ai?{billing_scope:'ai'}:{}) } },
        success_url: `${origin(env)}/account${ai?'/ai':''}?billing_order=${order.id}`, cancel_url: `${origin(env)}/account${ai?'/ai':''}?billing_canceled=1`,
        automatic_tax: { enabled: false }, allow_promotion_codes: false,
      }, { idempotencyKey: `postertiler-test-${order.id}` });
      const checkout = safeCheckoutUrl(session.url);
      if (session.livemode !== false || session.status !== 'open' || !checkout) return json({ error: 'checkout_unavailable' }, 502);
      operation = 'database';
      await store.attach(order.id, session.id);
      return json({ mode: 'test', order_id: order.id, url: checkout });
    } catch (error) { return json({ error: safeFailure(error), operation, reason: operation === 'stripe_checkout' ? checkoutSetupReason(error,env) : undefined }, 503); }
  };
}

async function webhook(request, env, makeStripe) {
  if (!ready(env)) return json({ error: 'test_billing_unavailable' }, 503);
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return json({ error: 'invalid_content_type' }, 415);
  const signature = request.headers.get('Stripe-Signature'); if (!signature) return json({ error: 'invalid_signature' }, 400);
  const stripe = makeStripe(env); let event;
  try { event = await stripe.webhooks.constructEventAsync(await readBody(request, 512 * 1024), signature, env.STRIPE_TEST_WEBHOOK_SECRET, 300, Stripe.createSubtleCryptoProvider()); }
  catch { return json({ error: 'invalid_signature' }, 400); }
  if (event.livemode !== false || event.account || !/^evt_[A-Za-z0-9]+$/.test(event.id || '')) return json({ error: 'wrong_environment' }, 400);
  if (!EVENTS.has(event.type)) return json({ received: true, ignored: true });
  let store = new BillingStore(env.BILLING_TEST_DB);
  let session, order, refund = null;
  if (event.type === 'charge.refunded') {
    const charge = await stripe.charges.retrieve(event.data.object.id);
    if (charge.livemode !== false || charge.currency !== 'usd' || !Number.isInteger(charge.amount_refunded) || charge.amount_refunded < 0) return json({ error: 'invalid_payment' }, 400);
    const pi = await stripe.paymentIntents.retrieve(objectId(charge.payment_intent));
    if(pi.metadata?.billing_scope==='ai')store=new BillingStore(env.BILLING_TEST_DB,{ai:true});
    order = await store.find(pi.metadata?.order_id || '');
    if (!order) return json({ received: true, ignored: true });
    if (charge.amount !== order.amount || objectId(charge.payment_intent) !== pi.id || pi.livemode !== false) return json({ error: 'invalid_payment' }, 400);
    let sessionId = order.session_id;
    if (!sessionId) {
      const sessions = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 2 });
      if (sessions.data.length !== 1) throw new Error('Cannot reconcile refund');
      sessionId = sessions.data[0].id;
    }
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
    if (objectId(session.payment_intent) !== pi.id) return json({ error: 'invalid_payment' }, 400);
    refund = charge.amount_refunded;
  } else {
    session = await stripe.checkout.sessions.retrieve(event.data.object.id, { expand: ['line_items'] });
    if(session.metadata?.billing_scope==='ai')store=new BillingStore(env.BILLING_TEST_DB,{ai:true});
    order = await store.find(session.metadata?.order_id || '');
    if (!order) return json({ received: true, ignored: true });
  }
  if (!validateSession(session, order)) return json({ error: 'payment_mismatch' }, 400);
  if (session.payment_status === 'paid' && !objectId(session.payment_intent)) return json({ error: 'invalid_payment' }, 400);
  await store.apply(event, order, session, refund);
  if(opsReady(env)&&session.payment_status==='paid'&&refund===null)try{
    const kind=session.metadata?.billing_scope==='ai'?'ai':'cloud';
    await opsQuery(env,'INSERT OR IGNORE INTO ops_payment_facts(mode,kind,order_id,paid_at) VALUES(?,?,?,?)','test',kind,order.id,Number.isInteger(event.created)?event.created*1000:Date.now()).run();
  }catch{/* Billing confirmation must survive optional reporting outages. */}
  return json({ received: true });
}
export const handleBilling = createBillingHandler();
export const handleAiBilling = createBillingHandler({ai:true});
