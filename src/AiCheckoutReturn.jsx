import React, { useEffect, useState } from 'react';
import { accountRequest } from './account-data';
import { AI_API } from './ai-client';
import { aiTaskUrl, notifyAiCredits } from './ai-navigation';
import { B } from './ui';

export default function AiCheckoutReturn({ orderId, canceled }) {
  const [order, setOrder] = useState(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (canceled || !orderId) return;
    let alive = true, timer, count = 0;
    async function check() {
      try {
        const data = await accountRequest(`${AI_API}/billing/orders/${orderId}`, { signal: AbortSignal.timeout(10000) });
        if (!alive) return; setOrder(data); setError('');
        if (data.status === 'paid') { notifyAiCredits(orderId); return; }
        if (['refunded','partially_refunded','failed','expired'].includes(data.status)) return;
      } catch { if (alive) setError('We could not confirm the order yet. Your original image is still in its tab.'); }
      if (alive && ++count < 30) timer = setTimeout(check, 2000);
    }
    check(); return () => { alive = false; clearTimeout(timer); };
  }, [orderId, canceled, revision]);
  const paid = order?.status === 'paid', terminal = ['refunded','partially_refunded','failed','expired'].includes(order?.status);
  function returnToImage() { notifyAiCredits(orderId, 'return-to-image'); window.close(); }
  return <main className="ai-checkout-return"><span className="account-eyebrow">AI CREDIT CHECKOUT</span><h1>{canceled ? 'Your image is waiting for you.' : paid ? 'Your test credits are ready.' : terminal ? 'Review your test order.' : 'Confirming your test payment.'}</h1><p>{canceled ? 'Checkout was canceled. Return to the original tab to continue with your image.' : paid ? 'Stripe has confirmed the test order. Return to your original tab; your image, enhancement settings and poster dimensions are still there.' : 'Credits are added only after Stripe confirms payment. You do not need to upload your image again.'}</p><p role="status">{canceled ? 'No payment completed from this checkout.' : paid ? 'Test payment confirmed · no real money charged.' : error || (order ? `Order status: ${order.status}` : 'Waiting for the confirmed order status…')}</p><div className="button-row"><B onClick={returnToImage}>Return to your image tab</B>{!canceled && !paid && <B secondary onClick={() => setRevision(value => value + 1)}>Check payment again</B>}<a className="button secondary" href={aiTaskUrl('upscale')}>Open AI Image Upscaler</a></div><small>If this tab stays open, switch to the original PosterTiler tab. Nothing starts automatically after a purchase.</small></main>;
}
