import React from 'react';
import { ArrowRight, Check, CloudArrowUp, FilePdf, Sparkle, LockSimple } from '@phosphor-icons/react';
import { TEST_CATALOG } from '../server/billing/catalog.mjs';
import { AI_PACKS } from '../server/ai/contract.mjs';
import { AiPlans } from './AiTools';
import { AI_USAGE, AI_STARTER, aiTaskCount } from './pricing-data';
import './account-workspace.css';
import './pricing.css';

export const priceLabel = value => `$${(value / 100).toFixed(2)}`;
export function PlanCards({ onChoose, busy = false, plans, selected }) {
  const offers = plans || Object.entries(TEST_CATALOG).map(([id, plan]) => ({ ...plan, id }));
  return <div className="cloud-offer-grid">{offers.map(plan => {
    const saving = Math.round((1 - plan.amount / (TEST_CATALOG.single.amount * plan.credits)) * 100);
    return <article className={`offer-card ${selected === plan.id ? 'selected' : ''}`} key={plan.id}>
      <span className="account-eyebrow">{plan.credits === 1 ? 'ONE CLOUD EXPORT' : 'FIVE CLOUD EXPORTS'}</span>
      <h3>{plan.id === 'pack5' ? 'Cloud Pack' : 'Cloud Single'}</h3>
      <div className="offer-price">{priceLabel(plan.amount)}<span> USD</span></div>
      <p className="offer-unit">{plan.credits} successful {plan.credits === 1 ? 'export' : 'exports'} · one-time</p>
      <p className="cloud-plan-value">{plan.credits > 1 ? <><strong>About {priceLabel(plan.amount / plan.credits)} per export</strong><span>Save {saving}% versus {plan.credits} single exports.</span></> : <><strong>For one larger project</strong><span>One export can contain up to 400 sheets.</span></>}</p>
      <ul><li><Check size={16} aria-hidden="true"/>Up to 400 poster sheets per export</li><li><Check size={16} aria-hidden="true"/>Private cloud processing</li><li><Check size={16} aria-hidden="true"/>Repeat downloads within 24 hours</li><li><Check size={16} aria-hidden="true"/>Technical failure releases the reserved credit</li></ul>
      {onChoose ? <button className="button" disabled={busy} onClick={() => onChoose(plan.id)}>{busy ? 'Opening checkout…' : `Test ${priceLabel(plan.amount)} checkout`}<ArrowRight size={16} aria-hidden="true"/></button> : <a className="button" href={`/account/billing?plan=${plan.id}`}>Try {plan.id === 'pack5' ? 'Cloud Pack' : 'Cloud Single'}<ArrowRight size={16} aria-hidden="true"/></a>}
      <small>Test checkout · no real charge. Cloud exports only; AI credits are separate.</small>
    </article>;
  })}</div>;
}

function TaskExamples() {
  return <section className="pricing-usage" aria-labelledby="ai-usage-heading">
    <div className="pricing-section-heading"><span className="account-eyebrow">WHAT YOUR CREDITS CAN DO</span><h2 id="ai-usage-heading">A clear price for each image.</h2><p>One task produces one image. The studio shows the required credits before you start.</p></div>
    <div className="pricing-usage-grid">{AI_USAGE.map(task => <article key={task.id}>
      <h3>{task.label}</h3><p className="usage-rate"><strong>{task.credits}</strong> AI credits / task</p><p>{task.detail}</p>
      <dl>{Object.values(AI_PACKS).map(pack => <div key={pack.credits}><dt>{pack.credits}-credit pack</dt><dd>{aiTaskCount(pack.credits, task.credits)} tasks</dd></div>)}</dl>
    </article>)}</div>
    <p className="pricing-reading-note">Each example uses the entire pack for that one task type. These task counts are alternatives, not quantities added together. Mix task types as you like; unused credits remain in your balance.</p>
  </section>;
}

const comparison = [
  ['Best for', 'An image you already have', 'Creating, editing or enhancing an image', 'Larger supported files or more sheets'],
  ['What you receive', 'Printable poster PDF', 'An image you can use in the free poster maker', 'Printable poster PDF made on a server'],
  ['What it uses', 'Your browser · no credits', '3, 8 or 16 AI credits per successful image', '1 cloud export credit per successful PDF'],
  ['Poster sheets', 'Up to 100 per poster', 'Use your result in the free maker: up to 100', 'Up to 400 per export'],
  ['AI image enhancement', 'Not included', '2× or 4×, within output limits', 'Not included'],
  ['Account required', 'No', 'Google sign-in · invited pilot accounts', 'Google sign-in'],
];
const fileLimits = [
  ['JPG', '32 MiB · 24 MP', '20 MiB · 100 MP'],
  ['PNG', '32 MiB · 24 MP', '8 MiB · 4 MP; 8-bit, non-interlaced'],
  ['WebP', 'Supported within local limits', 'Not supported in this release'],
  ['Longest image side', '12,000 pixels', '30,000 pixels'],
  ['File processing', 'On your device', 'Explicit upload to private cloud storage'],
  ['After you close the page', 'Current preparation stops', 'Uploaded, queued tasks continue'],
  ['Result availability', 'Keep your downloaded copy', '24 hours from task creation'],
];
const faqs = [
  ['Do I need to pay to download a poster PDF?', 'No. Ordinary local poster PDF exports stay free, including when you use an AI image you have already created. Pay for AI image tasks or choose Cloud PDF only when you need those optional services.'],
  ['Can I use AI credits for Cloud PDF?', 'The balances are separate. AI credits pay for image enhancement, generation and editing. A cloud export credit pays for one successful cloud PDF task, which may contain up to 400 sheets. You can also turn an AI result into a PDF with the free local maker.'],
  ['What happens if a cloud export fails?', 'Starting a cloud task reserves 1 cloud export credit. A successfully stored PDF uses it once. Technical failure or cancellation before completion releases the reservation. Canceling cannot undo a task that has already succeeded.'],
  ['What happens if an AI task fails?', 'Starting an AI task reserves the 3, 8 or 16 credits shown for that task. A successfully validated and stored image uses those credits once. Technical failure or cancellation before completion releases the reservation. Each new generation or edit is a new paid task, even if you use the same prompt.'],
  ['Does downloading again use more credits?', 'No. Download the same available result again at no extra cost. Submitting a new image, generation, edit or export task uses the credits quoted for that new task.'],
  ['Do credits or result files expire?', 'Credits have no timed expiry, but sandbox test balances and records may be reset during testing. AI and cloud result files are available for 24 hours from task creation. Download and keep your files before that window ends.'],
  ['Is this a subscription?', 'No. All shown packs are one-time purchases, with no monthly subscription or monthly credit reset. Buying AI credits does not include cloud export credits, and buying cloud exports does not include AI credits.'],
  ['Who can use AI and are these real purchases?', 'AI is currently a private pilot for invited Google accounts. Sign in to check your access. Stripe test payments are active, so no real purchase is charged. Public availability and live checkout will be clearly identified when they open.'],
  ['Will cloud processing make my image sharper?', 'Cloud PDF prepares the printable sheets on a server. Image enhancement is a separate AI task. More output pixels do not guarantee that missing details will be restored or that a print will look sharp at every size.'],
];

export default function Pricing() {
  return <main className="pricing-page pricing-v2">
    <header className="pricing-heading"><span className="account-eyebrow">FREE TO START · ONE-TIME OPTIONS</span><h1>Your next poster.<br/><span>A clear price for every step.</span></h1><p>Download printable PDFs for free. Create or enhance an image with AI, or export larger projects in the cloud.</p></header>
    <div className="pricing-stage-note"><LockSimple size={18} aria-hidden="true"/><p><strong>Test payments only.</strong> No real money is charged. AI tools are currently available to invited testers.</p></div>
    <section className="pricing-paths" aria-labelledby="pricing-paths-heading"><h2 id="pricing-paths-heading" className="visually-hidden">Choose what your poster needs</h2>
      <article className="pricing-path free-path"><FilePdf size={28} weight="light" aria-hidden="true"/><span className="account-eyebrow">I HAVE AN IMAGE</span><h3>Make a free poster</h3><p className="path-price">$0<span>Always free</span></p><p>Turn your image into printable sheets on your device.</p><ul><li><Check size={16} aria-hidden="true"/>Up to 100 sheets per poster</li><li><Check size={16} aria-hidden="true"/>Image adjustments and art effects</li><li><Check size={16} aria-hidden="true"/>No watermark or sign-up</li></ul><a className="button" href="/#poster-editor">Make a free poster<ArrowRight size={16} aria-hidden="true"/></a></article>
      <article className="pricing-path"><Sparkle size={28} weight="light" aria-hidden="true"/><span className="account-eyebrow">I WANT TO CREATE OR ENHANCE</span><h3>AI image tools</h3><p className="path-price">{priceLabel(AI_STARTER.amount)}<span>From · {AI_STARTER.credits} AI credits</span></p><p>Create artwork, edit an image or enhance its resolution.</p><ul><li><Check size={16} aria-hidden="true"/>GPT Image 2 generation and editing</li><li><Check size={16} aria-hidden="true"/>2× / 4× enhancement within limits</li><li><Check size={16} aria-hidden="true"/>Use the result in the free maker</li></ul><a className="button secondary" href="#ai-plans">Explore AI credits<ArrowRight size={16} aria-hidden="true"/></a></article>
      <article className="pricing-path"><CloudArrowUp size={28} weight="light" aria-hidden="true"/><span className="account-eyebrow">I NEED A LARGER CLOUD EXPORT</span><h3>Cloud PDF</h3><p className="path-price">{priceLabel(TEST_CATALOG.single.amount)}<span>From · 1 cloud export</span></p><p>Prepare larger supported projects on a server.</p><ul><li><Check size={16} aria-hidden="true"/>Up to 400 sheets per export</li><li><Check size={16} aria-hidden="true"/>Private, temporary cloud files</li><li><Check size={16} aria-hidden="true"/>Image enhancement is separate</li></ul><a className="button secondary" href="#cloud-plans">Explore cloud exports<ArrowRight size={16} aria-hidden="true"/></a></article>
    </section>
    <AiPlans pricing id="ai-plans"/>
    <TaskExamples/>
    <section className="pricing-cloud" id="cloud-plans" aria-labelledby="cloud-plans-heading"><div className="pricing-section-heading"><span className="account-eyebrow">OPTIONAL CLOUD PDF</span><h2 id="cloud-plans-heading">More sheets. Room for bigger files.</h2><p>Choose cloud when your device cannot finish the job or your poster needs more than 100 sheets. Check supported file limits below.</p></div><PlanCards/><p className="pricing-reading-note">One successful PDF task uses one cloud export credit, regardless of its sheet count within the 400-sheet limit. Cloud processing does not include AI image enhancement.</p></section>
    <section className="pricing-credit-rules" aria-labelledby="credit-rules-heading"><div><span className="account-eyebrow">TWO BALANCES. CLEAR ROLES.</span><h2 id="credit-rules-heading">Your image and your PDF are separate steps.</h2><p>AI credits create or enhance the image. Cloud export credits prepare a PDF on a server. They are independent and cannot be exchanged.</p></div><div className="pricing-workflow"><p><Sparkle size={20} aria-hidden="true"/><span><strong>AI image → free poster PDF</strong>Use AI credits for the image, then export locally for free.</span></p><p><CloudArrowUp size={20} aria-hidden="true"/><span><strong>AI image → cloud poster PDF</strong>Use AI credits for the image and a separate cloud export credit for the PDF.</span></p><p><FilePdf size={20} aria-hidden="true"/><span><strong>Your own image → free poster PDF</strong>No purchase, account or cloud upload required.</span></p></div></section>
    <section className="pricing-comparison" aria-labelledby="pricing-compare-heading"><div className="pricing-section-heading"><span className="account-eyebrow">COMPARE AT A GLANCE</span><h2 id="pricing-compare-heading">Choose the help your poster needs.</h2></div><p className="pricing-scroll-note" id="comparison-scroll-help">On smaller screens, scroll the comparison sideways to see all options.</p><div className="pricing-table-wrap" role="region" aria-label="Compare free, AI and cloud options" aria-describedby="comparison-scroll-help" tabIndex={0}><table><caption>What each option includes</caption><thead><tr><th scope="col">Capability</th><th scope="col">Free poster PDF</th><th scope="col">AI image tools</th><th scope="col">Cloud PDF</th></tr></thead><tbody>{comparison.map(([label,...values]) => <tr key={label}><th scope="row">{label}</th>{values.map((value,i) => <td key={i}>{value}</td>)}</tr>)}</tbody></table></div></section>
    <section className="pricing-limits" aria-labelledby="pricing-limits-heading"><div className="pricing-section-heading"><h2 id="pricing-limits-heading">Need the technical details?</h2><p>Check image and file limits before choosing a paid task.</p></div><details><summary>Local and cloud PDF file limits</summary><p className="pricing-reading-note">Cloud supports RGB or grayscale JPG and still PNG files. Cloud PNG limits are smaller than local PNG limits. Speed depends on the file, network and device.</p><div className="pricing-table-wrap" role="region" aria-label="Local and cloud file limits" tabIndex={0}><table><caption>Supported source images and result access</caption><thead><tr><th scope="col">Limit</th><th scope="col">Free local PDF</th><th scope="col">Cloud PDF</th></tr></thead><tbody>{fileLimits.map(([a,b,c]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td><td>{c}</td></tr>)}</tbody></table></div></details><details><summary>AI image sizes and enhancement limits</summary><p>Standard and high-quality image tasks support 1024 × 1024, 1024 × 1536 and 1536 × 1024. The 4K option is 3840 × 2160 and uses high quality. Each task returns one image.</p><p>Enhancement supports 2× or 4× when the result stays within 24 megapixels and 12,000 pixels per side. The studio checks the output size before you start. Larger pixel dimensions do not guarantee restored source detail.</p><p>AI result files are available for 24 hours from task creation. Images are processed by an external AI provider only after you agree to that task. <a href="/privacy">Read the data details.</a></p></details></section>
    <section className="pricing-faq" aria-labelledby="pricing-faq-heading"><h2 id="pricing-faq-heading">Questions before you choose?</h2>{faqs.map(([q,a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
    <section className="pricing-final"><h2>Start with the image. Keep the PDF free.</h2><p>Choose AI or cloud only when your project needs it.</p><div><a className="button" href="/#poster-editor">Make a free poster<ArrowRight size={16} aria-hidden="true"/></a><a className="button secondary" href="/account/ai">Open AI studio</a><a className="pricing-text-link" href="/cloud">Open Cloud PDF<ArrowRight size={16} aria-hidden="true"/></a></div></section>
  </main>;
}
