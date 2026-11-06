import React,{useEffect,useRef,useState} from 'react';
import { ArrowRight,Sparkle,ArrowClockwise } from '@phosphor-icons/react';
import { useAuth } from './AuthContext';
import { accountRequest } from './account-data';
import { inspectFile,PROCESSED_IMAGE_BYTES } from './engine/image.ts';
import { AI_PACKS,validateSpec } from '../server/ai/contract.mjs';
import { AI_API,activeAi,aiMessage,useAiAccount,aiWorkingCopy } from './ai-client';
import { AI_USAGE,aiTaskCount } from './pricing-data';
import { Alert,B,Field } from './ui';
import './ai-tools.css';

export function AiPlans({checkout=false,pricing=false,id}){
 const auth=useAuth(),[access,setAccess]=useState({status:'loading',enabled:false}),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),attempt=useRef(null);
 useEffect(()=>{
  if(auth.status!=='ready'){setAccess({status:auth.status==='error'?'error':'loading',enabled:false});return;}
  let alive=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  setAccess({status:'loading',enabled:false});
  accountRequest(AI_API+'/capabilities',{signal:controller.signal}).then(d=>{if(typeof d.enabled!=='boolean')throw new Error('invalid_response');if(alive)setAccess({status:'ready',enabled:d.enabled});}).catch(()=>{if(alive)setAccess({status:'error',enabled:false});}).finally(()=>clearTimeout(timer));
  return()=>{alive=false;clearTimeout(timer);controller.abort();};
 },[auth.status,auth.user?.id,revision]);
 const enabled=auth.status==='ready'&&access.status==='ready'&&access.enabled;
 const checking=auth.status==='loading'||access.status==='loading';
 const accessError=auth.status==='error'||access.status==='error';
 const note=checking?'AI tools are in a private pilot. Checking your access…':accessError?'We could not check your AI access. Prices remain visible; retry the access check to continue.':enabled?'Your account has AI pilot access. Stripe test purchases only.':auth.user?'AI tools are invite-only. Access is not currently enabled for this session.':'AI tools are currently invite-only. Sign in to check whether your account has access.';
 function recheck(){auth.refresh();setRevision(value=>value+1);}
 async function choose(plan){if(busy)return;setBusy(true);setError('');try{if(attempt.current?.plan!==plan)attempt.current={plan,request_id:crypto.randomUUID()};const result=await accountRequest(AI_API+'/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt.current),signal:AbortSignal.timeout(20000)});const u=new URL(result.url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com')throw new Error('invalid_response');location.assign(u.href);}catch{setError('Checkout could not be opened. Try again with the same option.');setBusy(false);}}
 return <section className="ai-plans" id={id} aria-label="AI credit packs"><div className="ai-section-heading"><div><span className="account-eyebrow">OPTIONAL AI TOOLS</span><h2>{pricing?'Create or enhance your image.':'Make something worth printing.'}</h2><p>Create artwork, edit an image or enhance its resolution. AI credits are separate from Cloud PDF exports.</p></div><Sparkle size={30} weight="light" aria-hidden="true"/></div>
 <div className="ai-access-note" data-state={accessError?'error':checking?'loading':enabled?'enabled':'restricted'} role="status"><p>{note}</p>{accessError&&<button type="button" onClick={recheck}>Retry access check</button>}</div>
 {checkout&&enabled&&<p className="ai-sandbox-note">AI generation uses the configured fal account and may incur real API costs, even with Stripe test credits.</p>}
 <div className="ai-plan-grid">{Object.entries(AI_PACKS).map(([planId,p])=><article className="ai-plan" key={planId}>
  <span className="ai-plan-purpose">{planId==='ai40'?'For your first ideas':'For more images and experiments'}</span><h3>{planId==='ai40'?'AI Starter':'AI Pack'}</h3><strong className="ai-price">${(p.amount/100).toFixed(2)}<span> USD</span></strong><p>{p.credits} AI credits · one-time</p>
  <div className="ai-plan-value"><strong>Up to {aiTaskCount(p.credits,AI_USAGE[0].credits)} enhancement or standard tasks</strong><span>If the entire pack is used for {AI_USAGE[0].credits}-credit tasks. High-quality and 4K tasks use more.</span></div>
  {pricing?<ul><li>GPT Image 2 generation and editing</li><li>2× / 4× enhancement within output limits</li><li>Apply your result to the free poster maker</li></ul>:<ul>{AI_USAGE.map(task=><li key={task.id}>{task.label} · {task.credits} credits</li>)}</ul>}
  {checking?<button className="button secondary" disabled>Checking access…</button>:accessError?<button className="button secondary" onClick={recheck}>Retry access check</button>:enabled?checkout&&auth.user?<B disabled={busy} onClick={()=>choose(planId)}>{busy?'Opening checkout…':`Test purchase · ${p.credits} credits`}</B>:<a className="button secondary" href="/account/ai">Open AI studio<ArrowRight size={16} aria-hidden="true"/></a>:<a className="button secondary" href="/account/ai">{auth.user?'View AI pilot details':'Sign in to check AI access'}<ArrowRight size={16} aria-hidden="true"/></a>}
  <small>No subscription. AI credits only; Cloud PDF exports are separate.</small>
 </article>)}</div>{error&&<Alert tone="error">{error}</Alert>}<small>Enhancement output up to 24 MP. Technical failures release reserved credits. One image per task. Download available results within 24 hours of task creation.</small></section>;
}

export function AiOrders(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){setBusy(true);setError('');try{const result=await accountRequest(AI_API+'/billing/status',{signal:AbortSignal.timeout(10000)});setData(result);}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{let alive=true;accountRequest(AI_API+'/billing/status',{signal:AbortSignal.timeout(10000)}).then(result=>{if(alive)setData(result);}).catch(()=>{});const update=()=>refresh();window.addEventListener('ai-updated',update);return()=>{alive=false;window.removeEventListener('ai-updated',update);};},[]);
 return <section className="ai-order-history"><div className="ai-section-heading"><h2>AI credit orders</h2><button disabled={busy} onClick={refresh}>{busy?'Refreshing…':'Refresh orders'}</button></div>{error&&<Alert>{aiMessage(error)}</Alert>}{data?.orders?.length?<div>{data.orders.map(order=><article key={order.id}><div><strong>{order.sku==='ai40'?'AI Starter · 40 credits':'AI Pack · 100 credits'}</strong><small>{new Date(order.created_at).toLocaleDateString()} · {order.id.slice(0,8)}</small></div><span>${(order.amount/100).toFixed(2)} USD</span><span>{order.status}</span>{order.refunded_amount>0&&<small>Refund recorded: ${(order.refunded_amount/100).toFixed(2)} · {order.refunded_credits} credits revoked</small>}</article>)}</div>:<p>{data?.enabled?'No AI credit orders yet. A purchase appears here after Checkout creates an order.':'AI sandbox orders will appear here when the pilot is configured for your account.'}</p>}<small>Stripe sandbox records. No real-money payment or cash refund is represented here.</small></section>;
}

export default function AiTools({source=null,pixels=null,onApply,onUndo,applied=false}){
 const auth=useAuth(),account=useAiAccount();
 const [kind,setKind]=useState(source?'upscale':'generate'),[quality,setQuality]=useState('medium'),[size,setSize]=useState('portrait'),[factor,setFactor]=useState(2),[prompt,setPrompt]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[result,setResult]=useState(null),[detail,setDetail]=useState(false),[upload,setUpload]=useState(null);
 const inputRef=useRef(null),attempt=useRef(null),locked=useRef(false),alive=useRef(true),epoch=useRef(0),before=useRef(null),after=useRef(null);
 const effectiveSource=source||upload?.url,dimensions=source?pixels:upload;
 const current=account.data?.jobs.find(activeAi),credits=kind==='upscale'?3:size==='4k'?16:quality==='high'?8:3;
 const sizeTooLarge=kind==='upscale'&&dimensions&&(dimensions.width*dimensions.height*factor*factor>24_000_000||Math.max(dimensions.width,dimensions.height)*factor>12000);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;};},[]);
 useEffect(()=>{epoch.current++;setConsent(false);setResult(null);attempt.current=null;},[source,upload?.url]);
 useEffect(()=>()=>{if(result?.url)URL.revokeObjectURL(result.url);},[result]);
 useEffect(()=>()=>{if(upload?.url)URL.revokeObjectURL(upload.url);},[upload]);
 useEffect(()=>{const id=new URLSearchParams(location.search).get('billing_order');if(!id||!/^[0-9a-f-]{36}$/i.test(id))return;let canceled=false,count=0;
  const timer=setInterval(async()=>{if(++count>30){clearInterval(timer);return;}try{const order=await accountRequest(AI_API+'/billing/orders/'+id);if(!canceled&&['paid','refunded','partially_refunded'].includes(order.status)){setNotice(order.status==='paid'?'Test payment confirmed. Your AI credits are ready.':'The order has been refunded. Your balance has been updated.');account.refresh();window.dispatchEvent(new Event('ai-updated'));clearInterval(timer);}}catch{}},2000);
  return()=>{canceled=true;clearInterval(timer);};
 },[]);
 function change(fn){if(locked.current)return;attempt.current=null;setError('');setNotice('');fn();}
 async function select(file){if(!file)return;setError('');try{const info=await inspectFile(file);setUpload({url:URL.createObjectURL(file),...info});setConsent(false);}catch(e){setError(e.message);}}
 async function start(){
  if(locked.current||current&&!(current.status==='awaiting_upload'&&attempt.current))return;locked.current=true;setBusy(true);setError('');setNotice('');const version=epoch.current;
  try{
   let copy;if(kind!=='generate'){if(!effectiveSource)throw new Error('invalid_source');copy=attempt.current?.copy||await aiWorkingCopy(effectiveSource,kind==='edit');}
   const input=kind==='upscale'?{kind,width:copy.width,height:copy.height,factor}:{kind,quality,size,prompt};validateSpec(input);
   if(!consent)throw new Error('upload_consent_required');
   if(!attempt.current)attempt.current={request_id:crypto.randomUUID(),copy};
   const body={request_id:attempt.current.request_id,spec:input,upload_consent:true,...(copy?{source_hash:copy.hash,source_size:copy.blob.size,source_type:'image/jpeg'}:{})};
   const created=await accountRequest(AI_API+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
   if(created.job.status==='awaiting_upload')await accountRequest(AI_API+'/jobs/'+created.job.id+'/source',{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:copy.blob,signal:AbortSignal.timeout(60000)});
   attempt.current=null;if(alive.current&&version===epoch.current)setNotice(created.job.status==='succeeded'?'This task is already complete. Open its result in Recent AI tasks.':'Task started. You can leave this page and find the result in your AI studio.');
  }catch(e){if(e.message==='request_closed')attempt.current=null;if(alive.current)setError(e.message==='invalid_spec'?'Enter a prompt and choose an available output size.':e.message==='invalid_source'?'Choose a source image first.':e.message==='upload_consent_required'?'Please confirm the AI processing disclosure before starting.':aiMessage(e.message));}
  finally{locked.current=false;if(alive.current)setBusy(false);account.refresh();}
 }
 async function cancel(job){setError('');try{await accountRequest(`${AI_API}/jobs/${job.id}/cancel`,{method:'POST'});attempt.current=null;setNotice('Task canceled. Reserved credits are released. An already running provider request may still finish, but will not be delivered or charged to your credits.');}catch(e){setError(aiMessage(e.message));}account.refresh();}
 async function openResult(job){if(locked.current)return;locked.current=true;setBusy(true);setError('');const version=epoch.current;
  try{const response=await fetch(`${AI_API}/jobs/${job.id}/download`,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('result_expired');const blob=await response.blob();const info=await inspectFile(blob,PROCESSED_IMAGE_BYTES);const bitmap=await createImageBitmap(blob);bitmap.close();
   if(alive.current&&version===epoch.current)setResult({url:URL.createObjectURL(blob),blob,...info,job,source:effectiveSource});
  }catch(e){if(alive.current)setError(aiMessage(e.message));}finally{locked.current=false;if(alive.current)setBusy(false);}
 }
 function syncScroll(e,other){if(other.current&&(other.current.scrollLeft!==e.currentTarget.scrollLeft||other.current.scrollTop!==e.currentTarget.scrollTop)){other.current.scrollLeft=e.currentTarget.scrollLeft;other.current.scrollTop=e.currentTarget.scrollTop;}}
 if(!auth.user)return <div className="ai-tool"><p>AI tools need an account and AI credits. Free colour adjustments and local PDFs still work without signing in.</p><a className="button secondary" href="/account/ai" target="_blank" rel="noopener">Sign in in a new tab<ArrowRight size={16}/></a><small>Return here after signing in to keep this image and its print settings.</small></div>;
 return <div className="ai-tool" data-clarity-mask="true"><div className="ai-balance"><span><Sparkle size={18}/>AI credits</span><strong>{account.data?.balance?.available??'—'}</strong><a href="/account/ai#ai-credit-packs" target="_blank" rel="noopener">Get credits</a></div>
 {account.loading&&<p role="status">Loading AI tools…</p>}{account.error&&<Alert>{aiMessage(account.error)}<button onClick={account.refresh}>Refresh</button></Alert>}
 {account.data&&<small>Stripe sandbox credits. AI generation itself uses the configured fal account.</small>}
 <fieldset className="ai-form" disabled={busy||!!current||!account.data?.enabled}><Field label="AI task"><select value={kind} onChange={e=>change(()=>{setKind(e.target.value);setConsent(false);})}><option value="generate">Create an image</option><option value="upscale">Enhance resolution</option><option value="edit">Edit an image</option></select></Field>
 {kind!=='generate'&&!source&&<Field label="Source image"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{select(e.target.files[0]);e.target.value='';}}/></Field>}
 {kind==='upscale'?<><Field label="Enhancement multiplier"><select value={factor} onChange={e=>change(()=>setFactor(Number(e.target.value)))}><option value={2}>2× width and height</option><option value={4}>4× width and height</option></select></Field>{dimensions&&<p className="ai-spec">{dimensions.width} × {dimensions.height} → {dimensions.width*factor} × {dimensions.height*factor} px</p>}<small>Up to 24 MP output. Enhancement can change details and cannot guarantee recovery of missing information.</small></>:<>
 <Field label={kind==='edit'?'Describe the changes':'Describe your artwork'}><textarea maxLength={1000} rows={4} value={prompt} onChange={e=>change(()=>setPrompt(e.target.value))} placeholder="A moonlit Japanese garden, precise ink lines, deep indigo and warm gold…"/></Field>
 <div className="ai-controls-row"><Field label="Image quality"><select value={quality} onChange={e=>change(()=>{setQuality(e.target.value);if(e.target.value==='medium'&&size==='4k')setSize('portrait');})}><option value="medium">Standard</option><option value="high">High quality</option></select></Field><Field label="Output shape"><select value={size} onChange={e=>change(()=>setSize(e.target.value))}><option value="portrait">Portrait · 1024 × 1536</option><option value="square">Square · 1024 × 1024</option><option value="landscape">Landscape · 1536 × 1024</option><option value="4k" disabled={quality!=='high'}>4K landscape · 3840 × 2160</option></select></Field></div>
 {kind==='edit'&&<small>A JPEG working copy is limited to a 1536 px edge and 1.6 MP for this editing tier. Your original stays unchanged.</small>}</>}
 {sizeTooLarge&&<Alert tone="error">This multiplier exceeds the 24 MP or 12,000 px output limit. Choose a lower multiplier or a smaller source.</Alert>}
 <label className="check ai-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I agree to send {kind==='generate'?'this prompt':'a working copy of this image'+(kind==='edit'?' and prompt':'')} to fal and its model provider for this task. Private website copies expire after 24 hours. <a href="/privacy" target="_blank" rel="noopener">Data details</a></span></label>
 <B className="wide" disabled={!consent||!!sizeTooLarge||kind!=='generate'&&!effectiveSource||(account.data?.balance?.available??0)<credits} onClick={start}>{busy?'Starting task…':`${kind==='upscale'?'Enhance image':kind==='edit'?'Edit image':'Generate image'} · ${credits} credits`}<Sparkle size={16}/></B>
 </fieldset>{(account.data?.balance?.available??0)<credits&&account.data&&<p className="ai-hint">This task needs {credits} AI credits. Ordinary Cloud PDF credits cannot be used here.</p>}
 {error&&<Alert tone="error">{error}</Alert>}{notice&&<p className="ai-notice" role="status">{notice}</p>}
 {current&&<div className="ai-current" role="status"><strong>{current.status==='awaiting_upload'?'Waiting for image upload':current.status==='submitting'?'Submitting to model':current.status==='processing'?'AI is processing your image':'Task queued'}</strong><p>{current.credits} credits reserved. You can return later.</p>{current.status==='awaiting_upload'&&attempt.current&&<B secondary disabled={busy} onClick={start}>Retry upload</B>}<button className="text-button" disabled={busy} onClick={()=>cancel(current)}>Cancel task</button></div>}
 {result&&<section className="ai-result"><div className="ai-section-heading"><h3>Your AI result</h3><button aria-pressed={detail} onClick={()=>setDetail(v=>!v)}>{detail?'Fit preview':'100% detail'}</button></div><p>{result.width} × {result.height} px · {result.job.credits} credits used</p><div className="ai-compare">{result.source&&<figure><figcaption>Source</figcaption><div ref={before} onScroll={e=>syncScroll(e,after)}><img src={result.source} alt="Source image for comparison" style={detail?{width:result.width,maxWidth:'none'}:undefined}/></div></figure>}<figure><figcaption>AI result</figcaption><div ref={after} onScroll={e=>syncScroll(e,before)}><img src={result.url} alt="AI processing result" style={detail?{width:result.width,maxWidth:'none'}:undefined}/></div></figure></div><div className="button-row"><B disabled={busy} onClick={()=>{onApply?.(result.blob,result);setNotice('AI result applied. Review your print settings, then download the free printable PDF.');}}>Use in poster<ArrowRight size={16}/></B><a className="button secondary" href={result.url} download="postertiler-ai-result.png">Download image</a></div><small>Review text, faces and artwork details before printing.</small></section>}
 {applied&&onUndo&&<button className="text-button" onClick={onUndo}><ArrowClockwise size={16}/>Remove AI result and use original</button>}
 {!!account.data?.jobs.length&&<details className="ai-history"><summary>Recent AI tasks</summary><div>{account.data.jobs.map(job=><article key={job.id}><div><strong>{job.kind==='upscale'?'HD enhancement':job.kind==='edit'?'Image edit':'Image creation'}</strong><span>{job.status} · {job.credits} credits{job.can_download?' used':''}</span>{job.error&&<small>{aiMessage(job.error)}</small>}</div>{job.can_download&&<button disabled={busy} onClick={()=>openResult(job)}>View result</button>}{job.can_cancel&&<button disabled={busy} onClick={()=>cancel(job)}>Cancel</button>}</article>)}</div></details>}
 </div>;
}
