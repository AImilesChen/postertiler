import React, { useEffect, useRef, useState } from 'react';
import { Alert, B } from './ui';

const api = '/api/billing/test';
const amount = value => `$${(value / 100).toFixed(2)}`;
const checkoutErrors = {
  stripe_authentication_failed: 'The configured Stripe test API key was rejected. Check the key in Cloudflare.',
  stripe_permission_denied: 'The Stripe test API key does not have the required permissions.',
  stripe_resource_not_found: 'The configured price was not found in this Stripe test account. Check that the prices and API key belong to the same sandbox.',
  price_configuration_mismatch: 'The Stripe price does not match this test plan. Check its amount, currency and one-time billing in the same sandbox.',
  stripe_request_rejected: 'Stripe rejected the test checkout setup. Its integration settings need review.',
  stripe_temporarily_unavailable: 'Stripe could not be reached. You can retry the same checkout.',
};
export default function BillingTestPanel() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [returned, setReturned] = useState(null);
  const attempt = useRef(null), alive = useRef(true);
  async function refresh(signal) {
    const response = await fetch(api + '/status', { credentials: 'same-origin', cache: 'no-store', signal });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.mode !== 'test' || typeof result.enabled !== 'boolean' || !Array.isArray(result.orders) || !Array.isArray(result.plans)) throw new Error();
    if (alive.current) setData(result);
    return result;
  }
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); let timer;
    const orderId = new URLSearchParams(location.search).get('billing_order');
    const validOrder = /^[0-9a-f-]{36}$/i.test(orderId || '');
    let polls = 0;
    async function check() {
      try {
        const result = await refresh(controller.signal);
        if (!result.enabled || !validOrder) return;
        const response = await fetch(api + '/orders/' + orderId, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const order = await response.json(); if (alive.current) setReturned(order);
        if (['created','pending'].includes(order.status) && ++polls < 6) timer = setTimeout(check, 2000);
      } catch { if (alive.current && validOrder) setError('We could not check this test order. Refresh its status in a moment.'); }
    }
    check(); return () => { alive.current = false; controller.abort(); clearTimeout(timer); };
  }, []);
  async function checkout(plan) {
    if (busy) return; setBusy(true); setError('');
    if (attempt.current?.plan !== plan) attempt.current = { plan, request_id: crypto.randomUUID() };
    try {
      const response = await fetch(api + '/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) {
        if (['order_not_payable','request_expired'].includes(result.error)) { attempt.current = null; await refresh(); }
        throw new Error(result.error === 'stripe_request_rejected' && result.operation === 'stripe_checkout' && typeof result.reason === 'string' ? result.reason : checkoutErrors[result.error] || (result.operation === 'database' ? 'The test order database could not be updated. Please try again.' : ''));
      }
      const target = new URL(result.url);
      if (result.mode !== 'test' || target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com') throw new Error();
      if (alive.current) location.assign(target.href);
    } catch (failure) { if (alive.current) setError('Test checkout could not open. ' + (failure.message || 'Check your order status, then try again.')); }
    finally { if (alive.current) setBusy(false); }
  }
  if (!data?.enabled) return error ? <Alert tone="error">{error}</Alert> : null;
  return <section className="billing-test-panel" aria-label="Stripe payment testing" data-clarity-mask="true">
    <span className="auth-label">STRIPE SANDBOX</span><h2>Payment testing</h2>
    <p>Test payments only. These credits do not purchase or run cloud processing. No real money is charged.</p>
    <p className="micro">Starting a test stores a pseudonymous account reference and test order history with Cloudflare, then opens Stripe Checkout. Enter Stripe test card details.</p>
    {error && <Alert tone="error">{error}</Alert>}
    {returned && <Alert>{returned.status === 'paid' ? 'Test payment confirmed by Stripe.' : ['refunded','partially_refunded'].includes(returned.status) ? 'This test payment has a refund.' : ['expired','failed'].includes(returned.status) ? 'This test checkout was not completed.' : 'Waiting for Stripe to confirm this test payment. You can refresh the status.'}</Alert>}
    <p><strong>{data.test_credits} test {data.test_credits === 1 ? 'credit' : 'credits'}</strong></p>
    <div className="billing-test-plans">{data.plans.map(plan => <div key={plan.id}><h3>{plan.name}</h3><p>{plan.credits} test {plan.credits === 1 ? 'export' : 'exports'} · {amount(plan.amount)} USD</p><B secondary disabled={busy} onClick={() => checkout(plan.id)}>{busy ? 'Opening checkout…' : `Test ${amount(plan.amount)} checkout`}</B></div>)}</div>
    <B secondary disabled={busy} onClick={async () => { setError(''); try { await refresh(); } catch { setError('We could not refresh test orders. Try again.'); } }}>Refresh test orders</B>
    {data.orders.length > 0 && <div className="billing-test-orders"><h3>Recent test orders</h3><ul>{data.orders.map(order => <li key={order.id}><span>{order.sku === 'pack5' ? 'Cloud Pack' : 'Cloud Single'} · {amount(order.amount)} USD</span><span>{order.status.replaceAll('_',' ')}</span></li>)}</ul></div>}
  </section>;
}
