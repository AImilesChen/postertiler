import React, { useEffect, useRef, useState } from 'react';
import { Alert, B } from './ui';
import { ArrowClockwise } from '@phosphor-icons/react';
import { PlanCards,priceLabel } from './Pricing';
import { Pagination,dateTime } from './AccountComponents';
import { useAccountListing } from './account-data';

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
export default function BillingTestPanel({compact=false}) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [returned, setReturned] = useState(null);
  const attempt = useRef(null), alive = useRef(true);
  const [filter,setFilter]=useState('all'),[page,setPage]=useState(1),[version,setVersion]=useState(0),[selected,setSelected]=useState(null);
  const listing=useAccountListing(!compact&&data?.enabled?api+'/orders':null,filter,page,version);
  async function refresh(signal) {
    const response = await fetch(api + '/status', { credentials: 'same-origin', cache: 'no-store', signal });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.mode !== 'test' || typeof result.enabled !== 'boolean' || !Array.isArray(result.orders) || !Array.isArray(result.plans)) throw new Error();
    if (alive.current) { setData(result); window.dispatchEvent(new Event('billing-updated')); }
    return result;
  }
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); let timer;
    const plan=new URLSearchParams(location.search).get('plan');if(['single','pack5'].includes(plan))setSelected(plan);
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
    const update=()=>refresh(controller.signal).catch(()=>{});
    window.addEventListener('cloud-updated',update);
    check(); return () => { alive.current = false; controller.abort(); clearTimeout(timer); window.removeEventListener('cloud-updated',update); };
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
  const confirmation=returned&&<Alert>{returned.status === 'paid' ? 'Test payment confirmed by Stripe. Your credits are ready.' : ['refunded','partially_refunded'].includes(returned.status) ? 'This test payment has a refund adjustment.' : ['expired','failed'].includes(returned.status) ? 'This checkout was not completed. No credit was added.' : 'Waiting for Stripe to confirm this test payment.'} <a href="/account/billing">View credits and orders</a>{['created','pending'].includes(returned.status)&&<button onClick={()=>location.reload()}>Check again</button>}</Alert>;
  if(compact)return <>{error&&<Alert tone="error">{error}</Alert>}{confirmation}</>;
  if(!data)return <section className="account-panel"><p role="status">Loading credits and orders…</p><B secondary onClick={()=>refresh().catch(()=>setError('We could not load your orders. Please try again.'))}>Try again</B>{error&&<Alert tone="error">{error}</Alert>}</section>;
  if(!data.enabled)return <section className="account-panel"><Alert>Cloud checkout is temporarily unavailable. All free tools are available.</Alert></section>;
  const statusLabel={paid:'Payment confirmed',created:'Checkout not completed',pending:'Awaiting confirmation',failed:'Payment unsuccessful',expired:'Checkout expired',refunded:'Refunded',partially_refunded:'Partially refunded'};
  return <div aria-label="Credits and orders" data-clarity-mask="true">{confirmation}{error&&<Alert tone="error">{error}</Alert>}<section className="billing-credit-banner"><div><span className="account-eyebrow">AVAILABLE TO USE</span><strong>{data.test_credits}<span> test {data.test_credits===1?'credit':'credits'}</span></strong></div><a className="button secondary" href="/cloud">Open Cloud PDF</a></section><section className="billing-plans"><div className="account-section-heading"><div><h2>Get more cloud credits</h2><p>One credit per successful export. No subscription.</p></div><a href="/pricing">Compare with Free</a></div><PlanCards plans={data.plans} busy={busy} selected={selected} onChoose={plan=>{setSelected(plan);checkout(plan);}}/><p className="account-help">These buttons open Stripe sandbox Checkout. Use test payment details. We store a pseudonymous account reference and order history; your poster image is not sent to Stripe.</p></section>
  <section className="account-panel orders-panel" aria-label="Order history"><div className="account-section-heading"><div><h2>Order history</h2><p>Test orders and payment status.</p></div><B secondary disabled={busy} onClick={async()=>{try{await refresh();setVersion(v=>v+1);}catch{setError('We could not refresh orders. Please try again.');}}}><ArrowClockwise size={16}/>Refresh orders</B></div><div className="account-filter"><label>Show orders<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}>{[['all','All orders'],['paid','Payment confirmed'],['open','Not completed'],['refunded','Refunded'],['closed','Failed or expired']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label></div>
  {listing.error?<Alert tone="error">Could not load order history. Try Refresh orders again.</Alert>:listing.loading&&!listing.data?<p role="status">Loading orders…</p>:listing.data&&<><div className="order-list" aria-busy={listing.loading}>{!listing.data.orders.length?<div className="account-empty"><h3>No orders in this view</h3><p>Choose another status, or use a sandbox plan above.</p></div>:listing.data.orders.map(order=><article className="order-row" key={order.id}><div><h3>{order.sku==='pack5'?'Cloud Pack · 5 exports':'Cloud Single · 1 export'}</h3><p>{dateTime(order.created_at)}</p><details><summary>Order reference</summary><span className="order-reference">{order.id}</span></details></div><div><strong>{priceLabel(order.amount)} USD</strong><span className={`task-status ${order.status==='paid'?'success':'neutral'}`}>{statusLabel[order.status]||'Status unavailable'}</span></div></article>)}</div><Pagination page={page} total={listing.data.total} size={listing.data.page_size} onChange={setPage}/></>}
  </section></div>;
}
