import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import Stripe from 'stripe';
import { createBillingHandler } from '../server/billing/handler.mjs';
import { TEST_CATALOG, validTestPrice } from '../server/billing/catalog.mjs';
import worker from '../server/worker.mjs';

const origin = 'https://postertiler.com', base = '/api/billing/test';
const schema = await readFile(new URL('../server/billing/migrations/0001_billing_test.sql', import.meta.url), 'utf8');
const signer = new Stripe('sk_test_fixtureOnly');
function sqliteD1(db) {
  function prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      first() { return db.prepare(sql).get(...values) || null; },
      all() { return { results: db.prepare(sql).all(...values) }; },
      run() { return { success: true, meta: db.prepare(sql).run(...values) }; },
    }; return statement;
  }
  return { prepare, batch(statements) { db.exec('BEGIN IMMEDIATE'); try { const result = statements.map(s => s.run()); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } } };
}
function fixture(t, user = { id: 'test-google-owner', email: 'test@example.invalid' }) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); db.exec(schema); t.after(() => db.close());
  const env = { AUTH_ORIGIN: origin, STRIPE_TEST_SECRET_KEY: 'sk_test_fixtureOnly', STRIPE_TEST_WEBHOOK_SECRET: 'whsec_fixtureOnly', BILLING_TEST_ENABLED: 'true', BILLING_TEST_DB: sqliteD1(db) };
  const calls = [], sessions = new Map(), idempotency = new Map();
  const api = {
    webhooks: signer.webhooks,
    prices: { async retrieve(id) { calls.push('price'); const plan = Object.values(TEST_CATALOG).find(p => p.price === id); return { id, active: true, livemode: false, type: 'one_time', billing_scheme: 'per_unit', currency: 'usd', unit_amount: plan.amount }; } },
    checkout: { sessions: {
      async create(params, options) {
        calls.push({ params, options });
        if (idempotency.has(options.idempotencyKey)) return structuredClone(idempotency.get(options.idempotencyKey));
        const price = params.line_items[0].price, plan = Object.values(TEST_CATALOG).find(p => p.price === price);
        const id = 'cs_test_fixture' + idempotency.size;
        const session = { id, url: 'https://checkout.stripe.com/c/pay/' + id, status: 'open', livemode: false, mode: 'payment', currency: 'usd', amount_subtotal: plan.amount, amount_total: plan.amount,
          payment_status: 'unpaid', payment_intent: 'pi_fixture' + idempotency.size, metadata: params.metadata, client_reference_id: params.client_reference_id,
          line_items: { data: [{ quantity: 1, price: { id: price } }], has_more: false } };
        sessions.set(id, session); idempotency.set(options.idempotencyKey, session); return structuredClone(session);
      },
      async retrieve(id) { return structuredClone(sessions.get(id)); },
      async list({ payment_intent }) { return { data: [...sessions.values()].filter(s => s.payment_intent === payment_intent) }; },
    } },
    charges: { async retrieve() { return { id: 'ch_fixture', livemode: false, currency: 'usd', amount: f.refundSession.amount_total, amount_refunded: f.refundAmount, payment_intent: f.refundSession.payment_intent }; } },
    paymentIntents: { async retrieve(id) { return { id, livemode: false, metadata: { order_id: f.refundSession.metadata.order_id } }; } },
  };
  const handler = createBillingHandler({ makeStripe: () => api, authenticate: async () => user });
  const f = { env, db, calls, sessions, api, handler,
    request(path, init = {}) { return handler(new Request(origin + base + path, init), env); },
    async checkout(plan = 'single', requestId = crypto.randomUUID(), extra = {}) {
      const response = await f.request('/checkout', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, request_id: requestId, ...extra }) });
      return { response, body: await response.json(), requestId };
    },
    async event(session, type = 'checkout.session.completed', overrides = {}, timestamp) {
      const event = { id: 'evt_' + crypto.randomUUID().replaceAll('-', ''), object: 'event', livemode: false, type, data: { object: { id: type === 'charge.refunded' ? 'ch_fixture' : session.id } }, ...overrides };
      const payload = JSON.stringify(event), signature = await signer.webhooks.generateTestHeaderStringAsync({ payload, secret: env.STRIPE_TEST_WEBHOOK_SECRET, timestamp, cryptoProvider: Stripe.createSubtleCryptoProvider() });
      return f.request('/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: payload });
    },
    async summary() { return (await f.request('/status')).json(); },
  }; return f;
}
async function order(f, plan = 'single') {
  const result = await f.checkout(plan); assert.equal(result.response.status, 200);
  const session = [...f.sessions.values()].find(s => s.metadata.order_id === result.body.order_id);
  return { ...result, session };
}
test('billing is unavailable without configuration; unrelated API still routes normally', async t => {
  const f = fixture(t); f.env.BILLING_TEST_ENABLED = 'false';
  assert.equal((await f.summary()).enabled, false); assert.equal((await f.checkout()).response.status, 503); assert.equal(f.calls.length, 0);
  const actual = await worker.fetch(new Request(origin + base + '/status'), {});
  assert.equal(actual.status, 401); assert.equal((await worker.fetch(new Request(origin + '/api/auth/session'), {})).status, 200);
});
test('live keys and missing webhook/database configuration never create a checkout', async t => {
  for (const [field,value] of [['STRIPE_TEST_SECRET_KEY','sk_live_fixtureOnly'],['STRIPE_TEST_WEBHOOK_SECRET',''],['BILLING_TEST_DB',null]]) {
    const f = fixture(t); f.env[field] = value; assert.equal((await f.checkout()).response.status, 503); assert.equal(f.calls.length, 0);
  }
});
test('authentication, exact origin, JSON type, input shape and size are enforced', async t => {
  const anonymous = fixture(t, null); assert.equal((await anonymous.checkout()).response.status, 401);
  const f = fixture(t);
  const valid = { method:'POST', headers:{Origin:origin,'Content-Type':'application/json'}, body:JSON.stringify({plan:'single',request_id:crypto.randomUUID()}) };
  assert.equal((await f.request('/checkout',{...valid,headers:{...valid.headers,Origin:'https://attacker.invalid'}})).status,403);
  assert.equal((await f.request('/checkout',{...valid,headers:{...valid.headers,'Content-Type':'text/plain'}})).status,415);
  for (const extra of [{amount:1},{price:'price_fake'},{credits:100},{return_url:'https://attacker.invalid'}, {request_id:'bad'}, {plan:'__proto__'}]) assert.equal((await f.checkout('single',crypto.randomUUID(),extra)).response.status,400);
  assert.equal((await f.request('/checkout',{...valid,body:'x'.repeat(5000)})).status,400);
  assert.equal((await f.request('/checkout')).status,405); assert.equal(f.calls.length,0);
});
test('both prices must match actual Stripe test amount, currency and one-time settings', async t => {
  for (const sku of ['single','pack5']) {
    const f = fixture(t); const result = await f.checkout(sku); assert.equal(result.response.status,200);
    const call=f.calls.find(c=>c.params); assert.deepEqual(call.params.line_items,[{price:TEST_CATALOG[sku].price,quantity:1}]);
    assert.equal(call.params.mode,'payment'); assert.equal(call.params.customer_email,undefined); assert.equal(call.params.allow_promotion_codes,false);
    assert.match(call.params.success_url,/^https:\/\/postertiler.com\/account\?billing_order=/);
  }
  const plan=TEST_CATALOG.single;
  const good={id:plan.price,livemode:false,active:true,type:'one_time',currency:'usd',unit_amount:199,billing_scheme:'per_unit'};
  for(const bad of [{livemode:true},{unit_amount:599},{currency:'eur'},{type:'recurring'},{active:false},{transform_quantity:{}},{id:'price_wrong'}]) assert.equal(validTestPrice({...good,...bad},plan),false);
  const f=fixture(t); f.api.prices.retrieve=async()=>({...good,livemode:true}); assert.equal((await f.checkout()).response.status,503); assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM billing_test_orders').get().n,0);
});
test('Stripe setup failures return a safe category and phase without raw provider details', async t => {
  for (const [cause, expected] of [[{type:'StripeAuthenticationError'},'stripe_authentication_failed'],[{type:'StripePermissionError'},'stripe_permission_denied'],[{code:'resource_missing'},'stripe_resource_not_found'],[{type:'StripeInvalidRequestError'},'stripe_request_rejected'],[{type:'StripeConnectionError'},'stripe_temporarily_unavailable']]) {
    const f=fixture(t);f.api.prices.retrieve=async()=>{throw {...cause,message:'fixture-private-secret-and-provider-body'};};
    const result=await f.checkout();assert.equal(result.response.status,503);assert.equal(result.body.error,expected);assert.equal(result.body.operation,'stripe_price');assert.ok(!JSON.stringify(result.body).includes('fixture-private'));
  }
});
test('repeated and concurrent checkout requests use one order and one Stripe idempotency key', async t => {
  const f=fixture(t), id=crypto.randomUUID();
  const results=await Promise.all([f.checkout('pack5',id),f.checkout('pack5',id),f.checkout('pack5',id)]);
  assert.ok(results.every(r=>r.response.status===200)); assert.equal(new Set(results.map(r=>r.body.order_id)).size,1); assert.equal(f.sessions.size,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM billing_test_orders').get().n,1);
  assert.equal((await f.checkout('single',id)).response.status,409);
});
test('an uncertain Stripe creation response can retry without a duplicate session', async t => {
  const f=fixture(t), original=f.api.checkout.sessions.create; let crash=true;
  f.api.checkout.sessions.create=async(...args)=>{const result=await original(...args);if(crash){crash=false;throw Error('connection lost');}return result;};
  const id=crypto.randomUUID(); assert.equal((await f.checkout('single',id)).response.status,503);
  const next=await f.checkout('single',id);assert.equal(next.response.status,200);assert.equal(f.sessions.size,1);
});
test('unsafe hosted URL or live-mode Checkout response is never returned to a client', async t => {
  for(const override of [{url:'https://attacker.invalid/pay'},{livemode:true}]){
    const f=fixture(t), original=f.api.checkout.sessions.create;
    f.api.checkout.sessions.create=async(...args)=>({...await original(...args),...override});
    assert.equal((await f.checkout()).response.status,502);
  }
});
test('old unattached idempotency requests and excessive new attempts are rejected', async t => {
  const f=fixture(t);const created=await order(f);
  f.db.prepare('UPDATE billing_test_orders SET session_id=NULL,created_at=?').run(Date.now()-24*3600000);
  assert.equal((await f.checkout('single',created.requestId)).response.status,409);
  f.db.prepare('DELETE FROM billing_test_orders').run();
  for(let i=0;i<10;i++)assert.equal((await f.checkout()).response.status,200);
  assert.equal((await f.checkout()).response.status,429);
});
test('return/status reads never grant credits and orders remain owner-scoped', async t => {
  const f=fixture(t), created=await order(f);created.session.payment_status='paid';
  assert.equal((await f.request('/orders/'+created.body.order_id)).status,200);assert.equal((await f.summary()).test_credits,0);
  const other=createBillingHandler({makeStripe:()=>f.api,authenticate:async()=>({id:'another-google-user'})});
  assert.equal((await other(new Request(origin+base+'/orders/'+created.body.order_id),f.env)).status,404);
  const stored=f.db.prepare('SELECT * FROM billing_test_orders').get(); assert.match(stored.user_key,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(stored).includes('test@example.invalid'));
});
test('Stripe signature validation rejects unsigned, modified and stale raw bodies', async t => {
  const f=fixture(t), created=await order(f);created.session.payment_status='paid';
  assert.equal((await f.request('/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
  assert.equal((await f.request('/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':'t=1,v1=bad'},body:'{}'})).status,400);
  assert.equal((await f.event(created.session,undefined,{},Math.floor(Date.now()/1000)-600)).status,400);
  assert.equal((await f.summary()).test_credits,0);
});
test('signed live or connected-account events cannot grant test credits', async t => {
  const f=fixture(t),created=await order(f);created.session.payment_status='paid';
  assert.equal((await f.event(created.session,undefined,{livemode:true})).status,400);
  assert.equal((await f.event(created.session,undefined,{account:'acct_other'})).status,400);
  assert.equal((await f.summary()).test_credits,0);
});
test('paid events grant once across duplicate event IDs and different payment-success events', async t => {
  const f=fixture(t),created=await order(f,'pack5');created.session.payment_status='paid';
  for(const type of ['checkout.session.completed','checkout.session.completed','checkout.session.async_payment_succeeded']) assert.equal((await f.event(created.session,type,{id:'evt_same'})).status,200);
  assert.equal((await f.event(created.session)).status,200);assert.equal((await f.summary()).test_credits,5);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM billing_test_events').get().n,2);
});
test('unpaid completion remains pending, then actual asynchronous payment grants credits', async t => {
  const f=fixture(t),created=await order(f);
  assert.equal((await f.event(created.session)).status,200);assert.equal((await f.summary()).test_credits,0);
  created.session.payment_status='paid'; assert.equal((await f.event(created.session,'checkout.session.async_payment_succeeded')).status,200);assert.equal((await f.summary()).test_credits,1);
});
test('amount, quantity, identity, metadata and purchased price mismatches never grant', async t => {
  for(const mutation of [s=>s.amount_total=1,s=>s.currency='eur',s=>s.client_reference_id='other',s=>s.line_items.data[0].quantity=2,s=>s.line_items.data[0].price.id='price_other',s=>s.metadata.sku='pack5',s=>s.livemode=true]){
    const f=fixture(t),created=await order(f);created.session.payment_status='paid';mutation(created.session);
    assert.equal((await f.event(created.session)).status,400);assert.equal((await f.summary()).test_credits,0);
  }
});
test('expired or failed events do not give credits; older failure cannot undo a confirmed payment', async t => {
  const f=fixture(t),created=await order(f);
  assert.equal((await f.event(created.session,'checkout.session.expired')).status,200);assert.equal((await f.summary()).orders[0].status,'expired');assert.equal((await f.summary()).test_credits,0);
  created.session.payment_status='paid';assert.equal((await f.event(created.session)).status,200);
  created.session.payment_status='unpaid';assert.equal((await f.event(created.session,'checkout.session.async_payment_failed')).status,200);assert.equal((await f.summary()).orders[0].status,'paid');
});
test('partial and full refunds revoke test credits once and stale refund notices cannot restore them', async t => {
  const f=fixture(t),created=await order(f,'pack5');created.session.payment_status='paid';await f.event(created.session);
  f.refundSession=created.session;f.refundAmount=120;await f.event(created.session,'charge.refunded');assert.equal((await f.summary()).test_credits,4);
  f.refundAmount=599;await f.event(created.session,'charge.refunded');await f.event(created.session,'charge.refunded');
  f.refundAmount=120;await f.event(created.session,'charge.refunded');await f.event(created.session);
  assert.equal((await f.summary()).test_credits,0);assert.equal((await f.summary()).orders[0].status,'refunded');
});
test('refund before the paid event is retained when payment fulfillment arrives later', async t => {
  const f=fixture(t),created=await order(f,'pack5');created.session.payment_status='paid';
  f.refundSession=created.session;f.refundAmount=599;await f.event(created.session,'charge.refunded');await f.event(created.session);
  assert.equal((await f.summary()).test_credits,0);assert.equal((await f.summary()).orders[0].status,'refunded');
});
test('event and entitlement updates roll back together on database errors and can retry', async t => {
  const f=fixture(t),created=await order(f);created.session.payment_status='paid';
  f.db.exec("CREATE TRIGGER fail_credit BEFORE UPDATE OF paid ON billing_test_orders BEGIN SELECT RAISE(ABORT,'fixture write failure'); END");
  assert.equal((await f.event(created.session,undefined,{id:'evt_retry'})).status,503);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM billing_test_events').get().n,0);
  f.db.exec('DROP TRIGGER fail_credit');assert.equal((await f.event(created.session,undefined,{id:'evt_retry'})).status,200);assert.equal((await f.summary()).test_credits,1);
});
