import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import { ArrowRight,Sparkle,ArrowClockwise,UploadSimple,CaretDown } from '@phosphor-icons/react';
import { useAuth } from './AuthContext';
import { accountRequest } from './account-data';
import { inspectFile,PROCESSED_IMAGE_BYTES } from './engine/image.ts';
import { AI_PACKS,MODERATION_VERSION,validateSpec } from '../server/ai/contract.mjs';
import { AI_API,activeAi,aiMessage,useAiAccount,aiWorkingCopy } from './ai-client';
import { AI_USAGE,aiTaskCount } from './pricing-data';
import AiCreditDialog from './AiCreditDialog';
import { AI_TASKS,AI_CHANNEL,aiTaskUrl } from './ai-navigation';
import { aiJobFeedback,selectedAiFeedback } from './ai-job-state';
import { Alert,B,Field } from './ui';
import './ai-tools.css';
import './ai-workflow.css';

export function AiPlans({checkout=false,pricing=false,id,onCheckout}){
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
 const [checkoutLink,setCheckoutLink]=useState('');
 async function choose(plan){
  if(busy)return;setBusy(true);setError('');setCheckoutLink('');
  const popup=window.open('about:blank','_blank');
  if(popup){popup.opener=null;popup.document.title='Preparing test checkout | PosterTiler';popup.document.body.textContent='Preparing secure test checkout. Your image stays in the original PosterTiler tab.';}
  try{
   if(attempt.current?.plan!==plan)attempt.current={plan,request_id:crypto.randomUUID()};
   const result=await accountRequest(AI_API+'/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt.current),signal:AbortSignal.timeout(20000)});
   const u=new URL(result.url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com'||typeof result.order_id!=='string')throw new Error('invalid_response');
   onCheckout?.({orderId:result.order_id});
   if(popup&&!popup.closed)popup.location.replace(u.href);else setCheckoutLink(u.href);
  }catch{if(popup&&!popup.closed)popup.close();setError('Checkout could not be opened. Try again with the same option.');}finally{setBusy(false);}
 }
 return <section className="ai-plans" id={id} aria-label="AI credit packs"><div className="ai-section-heading"><div><span className="account-eyebrow">OPTIONAL AI TOOLS</span><h2>{pricing?'Create or enhance your image.':checkout?'Choose a one-time credit pack.':'Make something worth printing.'}</h2><p>Create artwork, edit an image or enhance its resolution. AI credits are separate from Cloud PDF exports.</p></div><Sparkle size={30} weight="light" aria-hidden="true"/></div>
 <div className="ai-access-note" data-state={accessError?'error':checking?'loading':enabled?'enabled':'restricted'} role="status"><p>{note}</p>{accessError&&<button type="button" onClick={recheck}>Retry access check</button>}</div>
 {checkout&&enabled&&<p className="ai-sandbox-note">AI generation uses the configured fal account and may incur real API costs, even with Stripe test credits.</p>}
 <div className="ai-plan-grid">{Object.entries(AI_PACKS).map(([planId,p])=><article className="ai-plan" key={planId}>
  <span className="ai-plan-purpose">{planId==='ai40'?'For your first ideas':'For more images and experiments'}</span><h3>{planId==='ai40'?'AI Starter':'AI Pack'}</h3><strong className="ai-price">${(p.amount/100).toFixed(2)}<span> USD</span></strong><p>{p.credits} AI credits · one-time</p>
  <div className="ai-plan-value"><strong>Up to {aiTaskCount(p.credits,AI_USAGE[0].credits)} enhancement or standard tasks</strong><span>If the entire pack is used for {AI_USAGE[0].credits}-credit tasks. High-quality and 4K tasks use more.</span></div>
  {pricing?<ul><li>GPT Image 2 generation and editing</li><li>2× / 4× enhancement within output limits</li><li>Apply your result to the free poster maker</li></ul>:<ul>{AI_USAGE.map(task=><li key={task.id}>{task.label} · {task.credits} credits</li>)}</ul>}
  {checking?<button className="button secondary" disabled>Checking access…</button>:accessError?<button className="button secondary" onClick={recheck}>Retry access check</button>:enabled?checkout&&auth.user?<B disabled={busy} onClick={()=>choose(planId)}>{busy?'Opening checkout…':`Test purchase · ${p.credits} credits`}</B>:<a className="button secondary" href="/account/ai">Open AI studio<ArrowRight size={16} aria-hidden="true"/></a>:<a className="button secondary" href="/account/ai">{auth.user?'View AI pilot details':'Sign in to check AI access'}<ArrowRight size={16} aria-hidden="true"/></a>}
  <small>No subscription. AI credits only; Cloud PDF exports are separate.</small>
 </article>)}</div>{checkoutLink&&<p className="ai-checkout-fallback">Your image stays here. <a className="button" href={checkoutLink} target="_blank" rel="noopener noreferrer">Open secure test checkout in a new tab</a></p>}{error&&<Alert tone="error">{error}</Alert>}<small>Enhancement output up to 24 MP. Technical failures release reserved credits. One image per task. Download available results within 24 hours of task creation.</small></section>;
}

export function AiOrders(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){setBusy(true);setError('');try{const result=await accountRequest(AI_API+'/billing/status',{signal:AbortSignal.timeout(10000)});setData(result);}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{let alive=true;accountRequest(AI_API+'/billing/status',{signal:AbortSignal.timeout(10000)}).then(result=>{if(alive)setData(result);}).catch(()=>{});const update=()=>refresh();window.addEventListener('ai-updated',update);return()=>{alive=false;window.removeEventListener('ai-updated',update);};},[]);
 return <section className="ai-order-history"><div className="ai-section-heading"><h2>AI credit orders</h2><button disabled={busy} onClick={refresh}>{busy?'Refreshing…':'Refresh orders'}</button></div>{error&&<Alert>{aiMessage(error)}</Alert>}{data?.orders?.length?<div>{data.orders.map(order=><article key={order.id}><div><strong>{order.sku==='ai40'?'AI Starter · 40 credits':'AI Pack · 100 credits'}</strong><small>{new Date(order.created_at).toLocaleDateString()} · {order.id.slice(0,8)}</small></div><span>${(order.amount/100).toFixed(2)} USD</span><span>{order.status}</span>{order.refunded_amount>0&&<small>Refund recorded: ${(order.refunded_amount/100).toFixed(2)} · {order.refunded_credits} credits revoked</small>}</article>)}</div>:<p>{data?.enabled?'No AI credit orders yet. A purchase appears here after Checkout creates an order.':'AI sandbox orders will appear here when the pilot is configured for your account.'}</p>}<small>Stripe sandbox records. No real-money payment or cash refund is represented here.</small></section>;
}

export default function AiTools({task='upscale',source=null,pixels=null,onApply,onUndo,applied=false,onPreview,workspace=false,returnTo}) {
 const kind=Object.hasOwn(AI_TASKS,task)?task:'upscale',auth=useAuth(),account=useAiAccount();
 const [quality,setQuality]=useState('medium'),[size,setSize]=useState('portrait'),[factor,setFactor]=useState(2),[prompt,setPrompt]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[result,setResult]=useState(null),[upload,setUpload]=useState(null),[creditOpen,setCreditOpen]=useState(false);
 const attempt=useRef(null),locked=useRef(false),alive=useRef(true),epoch=useRef(0),checkout=useRef(null),jobSources=useRef(new Map()),submittedJob=useRef(null),openedJob=useRef(null);
 const [localJob,setLocalJob]=useState(null),[hosts,setHosts]=useState(null),fileInput=useRef(null);
 useEffect(()=>{if(workspace)setHosts({toolbar:document.getElementById('ai-workbench-toolbar'),footer:document.getElementById('ai-workbench-results')});},[workspace]);
 const effectiveSource=source||upload?.url,dimensions=source?pixels:upload;
 const current=account.data?.jobs.find(activeAi),credits=kind==='upscale'?3:size==='4k'?16:quality==='high'?8:3;
 const feedbackJob=selectedAiFeedback(account.data?.jobs,{localJob,restoreLatest:!workspace,kind}),feedback=aiJobFeedback(feedbackJob);
 const available=account.data?.balance?.available??0,ready=auth.status==='ready'&&!!auth.user&&account.data?.enabled;
 const insufficient=ready&&available<credits;
 const sizeTooLarge=kind==='upscale'&&dimensions&&(dimensions.width*dimensions.height*factor*factor>24_000_000||Math.max(dimensions.width,dimensions.height)*factor>12000);
 const closeCredits=useCallback(()=>setCreditOpen(false),[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;};},[]);
 useEffect(()=>{epoch.current++;setConsent(false);setResult(null);setLocalJob(null);attempt.current=null;submittedJob.current=null;setError('');setNotice('');},[source,upload?.url,kind]);
 useEffect(()=>()=>{if(result?.url)URL.revokeObjectURL(result.url);},[result]);
 useEffect(()=>()=>{if(upload?.url)URL.revokeObjectURL(upload.url);},[upload]);
 useEffect(()=>{onPreview?.({source:result?result.source:kind==='generate'?null:effectiveSource,result:result?.url,sourcePixels:dimensions,resultPixels:result,job:feedbackJob,onRefresh:account.refresh,onOpenResult:feedbackJob?.can_download?()=>openResult(feedbackJob):undefined,busy});},[onPreview,effectiveSource,dimensions?.width,dimensions?.height,result,kind,feedbackJob,account.refresh,busy]);
 useEffect(()=>()=>onPreview?.(null),[onPreview]);
 useEffect(()=>{
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(AI_CHANNEL):null;
  if(channel)channel.onmessage=event=>{if(event.data?.orderId===checkout.current?.orderId){account.refresh();if(event.data.type==='return-to-image'){window.focus();setCreditOpen(false);setNotice('Your image and settings are still here. Check your balance, then start when ready.');}}};
  return()=>channel?.close();
 },[account.refresh]);
 useEffect(()=>{if(checkout.current&&available>checkout.current.balanceBefore){setCreditOpen(false);checkout.current=null;setNotice('AI credits updated. Your image and settings are ready; nothing has started automatically.');}},[available]);
 useEffect(()=>{const completed=account.data?.jobs.find(job=>job.id===submittedJob.current)||(!workspace&&!effectiveSource?account.data?.jobs.find(job=>job.kind===kind):null);if(completed?.status==='succeeded'&&completed.can_download&&result?.job.id!==completed.id&&openedJob.current!==completed.id&&!locked.current){openedJob.current=completed.id;submittedJob.current=null;openResult(completed);}},[account.data?.jobs,result?.job.id,effectiveSource,kind,workspace]);
 function change(fn){if(locked.current)return;attempt.current=null;setError('');setNotice('');fn();}
 async function select(file){if(!file)return;setError('');try{const info=await inspectFile(file);setUpload({url:URL.createObjectURL(file),...info});setConsent(false);}catch(e){setError(e.message);}}
 async function start(){
  if(locked.current||!ready)return;
  if(available<credits){setCreditOpen(true);return;}
  if(current&&!(current.status==='awaiting_upload'&&attempt.current))return;
  locked.current=true;setBusy(true);setError('');setNotice('');setResult(null);setLocalJob({id:'preparing',kind,status:'preparing',credits});const version=epoch.current;
  try{
   let copy;if(kind!=='generate'){if(!effectiveSource)throw new Error('invalid_source');copy=attempt.current?.copy||await aiWorkingCopy(effectiveSource,kind==='edit');}
   const input=kind==='upscale'?{kind,width:copy.width,height:copy.height,factor}:{kind,quality,size,prompt};validateSpec(input);
   if(!consent)throw new Error('upload_consent_required');
   if(!attempt.current)attempt.current={request_id:crypto.randomUUID(),copy};
   const body={request_id:attempt.current.request_id,spec:input,upload_consent:true,moderation_consent:MODERATION_VERSION,...(copy?{source_hash:copy.hash,source_size:copy.blob.size,source_type:'image/jpeg'}:{})};
   const created=await accountRequest(AI_API+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
   jobSources.current.set(created.job.id,kind==='generate'?null:effectiveSource);
   submittedJob.current=created.job.id;
   setLocalJob(created.job);
   if(created.job.status==='awaiting_upload'){const uploaded=await accountRequest(AI_API+'/jobs/'+created.job.id+'/source',{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:copy.blob,signal:AbortSignal.timeout(60000)});if(alive.current&&version===epoch.current)setLocalJob(uploaded.job);}
   attempt.current=null;
  }catch(e){if(e.message==='request_closed')attempt.current=null;if(alive.current){setLocalJob(null);setError(e.message==='invalid_spec'?(kind==='upscale'?'Choose a supported multiplier and image size.':'Enter a prompt and choose an available output size.'):e.message==='invalid_source'?'Choose a source image first.':e.message==='upload_consent_required'?'Confirm image processing before starting.':aiMessage(e.message));if(e.message==='insufficient_ai_credits')setCreditOpen(true);}}
  finally{locked.current=false;if(alive.current)setBusy(false);account.refresh();}
 }
 async function cancel(job){setError('');try{const canceled=await accountRequest(`${AI_API}/jobs/${job.id}/cancel`,{method:'POST'});setLocalJob(canceled.job);attempt.current=null;setNotice('');}catch(e){setError(aiMessage(e.message));}account.refresh();}
 async function openResult(job){if(locked.current)return;locked.current=true;setBusy(true);setError('');const version=epoch.current;
  try{const response=await fetch(`${AI_API}/jobs/${job.id}/download`,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('result_expired');const blob=await response.blob();const info=await inspectFile(blob,PROCESSED_IMAGE_BYTES);const bitmap=await createImageBitmap(blob);bitmap.close();
   if(alive.current&&version===epoch.current){setLocalJob(job);setResult({url:URL.createObjectURL(blob),blob,...info,job,source:jobSources.current.get(job.id)===effectiveSource?effectiveSource:null});setNotice(workspace?'':'Your result is ready. Compare the details, then choose Use in poster.');}
  }catch(e){if(alive.current)setError(aiMessage(e.message));}finally{locked.current=false;if(alive.current)setBusy(false);}
 }
 const missingInput=kind==='generate'?!prompt.trim():!effectiveSource;
 const actionLabel=auth.status==='loading'?'Checking sign-in…':auth.status==='error'?'Retry sign-in check':!auth.user?`Sign in to ${kind==='upscale'?'enhance':kind==='edit'?'edit':'generate'}`:account.loading&&!account.data?'Checking AI access…':!ready?'AI access unavailable':insufficient?`Get AI credits · ${credits} needed`:busy?'Starting task…':`${AI_TASKS[kind].verb} · ${credits} credits`;
 const balanceContent=(<div className="ai-balance"><span><Sparkle size={18} aria-hidden="true"/>AI credits</span><strong>{auth.user?account.data?.balance?.available??'—':'—'}</strong>{ready&&<button className="ai-credit-link" onClick={()=>setCreditOpen(true)}>Get AI credits</button>}</div>);
 const historyContent=(!!account.data?.jobs.length&&<details className="ai-history" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary>Recent AI tasks<CaretDown size={14} aria-hidden="true"/></summary><div>{account.data.jobs.map(job=><article key={job.id}><div><strong>{job.kind==='upscale'?'HD enhancement':job.kind==='edit'?'Image edit':'Image creation'}</strong><span>{job.status} · {job.credits} credits{job.can_download?' used':''}</span>{job.error&&<small>{aiMessage(job.error)}</small>}</div>{job.can_download&&<button disabled={busy} onClick={event=>{event.currentTarget.closest('details').open=false;openResult(job);}}>View result</button>}{job.can_cancel&&<button disabled={busy} onClick={()=>cancel(job)}>Cancel</button>}</article>)}</div></details>);
 const resultContent=(result&&<section className="ai-result"><h3>{workspace?'Use your enhanced image':'Your AI result is ready'}</h3><p>{result.width} × {result.height} px{workspace?' · PNG':` · ${result.job.credits} credits used`}</p><div className="button-row"><B disabled={busy} onClick={()=>{onApply?.(result.blob,result);setNotice('AI result applied. Review your print settings, then download the free printable PDF.');}}>Use in poster<ArrowRight size={16}/></B><a className="button secondary" href={result.url} download="postertiler-ai-result.png">Download image</a></div><small>Review text, faces and artwork details before printing.</small></section>);
 return <div className={`ai-tool ai-focused-tool ai-task-${kind}`} data-clarity-mask="true">
  {workspace&&hosts?.toolbar?createPortal(<>{balanceContent}{historyContent}</>,hosts.toolbar):balanceContent}
  {auth.status==='error'&&<Alert>We could not check your sign-in. <button onClick={auth.refresh}>Try again</button></Alert>}
  {!auth.user&&auth.status==='ready'&&!auth.available&&<Alert>Sign-in is temporarily unavailable. Your selected image stays in this tab.</Alert>}
  {account.error&&<Alert>{aiMessage(account.error)} <button onClick={account.refresh}>Refresh access</button></Alert>}
  {!auth.user&&auth.status==='ready'&&<p className="ai-hint">Choose your image and settings first. Sign in in a new tab to check pilot access; your image stays here.</p>}
  <fieldset className="ai-form" disabled={busy||!!current}>
   {kind!=='generate'&&!source&&(workspace?<div className="workspace-upload"><input ref={fileInput} className="workspace-file-input" tabIndex={-1} aria-label="Source image" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{select(e.target.files[0]);e.target.value='';}}/>{upload?<img src={upload.url} alt="Selected source thumbnail"/>:<UploadSimple size={25} aria-hidden="true"/>}<button type="button" className="button secondary" onClick={()=>fileInput.current?.click()}>{upload?'Change image':'Upload image'}</button><span>{upload?`${upload.width} × ${upload.height} px selected`:'JPG, PNG or WebP'}</span></div>:<Field label="Source image"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{select(e.target.files[0]);e.target.value='';}}/></Field>)}
   {kind==='upscale'?<>{workspace?<div className="workspace-multiplier"><span>Enlarge by</span><div role="group" aria-label="Enhancement multiplier">{[2,4].map(value=><button type="button" key={value} aria-pressed={factor===value} onClick={()=>change(()=>setFactor(value))}>{value}×<span>width & height</span></button>)}</div></div>:<Field label="Enhancement multiplier"><select value={factor} onChange={e=>change(()=>setFactor(Number(e.target.value)))}><option value={2}>2× width and height</option><option value={4}>4× width and height</option></select></Field>}{dimensions&&<p className="ai-spec">{dimensions.width} × {dimensions.height} → <strong>{dimensions.width*factor} × {dimensions.height*factor} px</strong></p>}<small>{workspace?'Up to 24 MP · proportions preserved':'Up to 24 MP output. Your image composition and proportions stay the same; AI-generated detail may vary.'}</small></>:<>
    <Field label={kind==='edit'?'Describe the changes':'Describe your artwork'}><textarea maxLength={1000} rows={4} value={prompt} onChange={e=>change(()=>setPrompt(e.target.value))} placeholder="A moonlit Japanese garden, precise ink lines, deep indigo and warm gold…"/></Field>
    <div className="ai-controls-row"><Field label="Image quality"><select value={quality} onChange={e=>change(()=>{setQuality(e.target.value);if(e.target.value==='medium'&&size==='4k')setSize('portrait');})}><option value="medium">Standard</option><option value="high">High quality</option></select></Field><Field label="Output shape"><select value={size} onChange={e=>change(()=>setSize(e.target.value))}><option value="portrait">Portrait · 1024 × 1536</option><option value="square">Square · 1024 × 1024</option><option value="landscape">Landscape · 1536 × 1024</option><option value="4k" disabled={quality!=='high'}>4K landscape · 3840 × 2160</option></select></Field></div>
    {kind==='edit'&&<small>A JPEG working copy is limited to a 1536 px edge and 1.6 MP for editing. Your original stays unchanged.</small>}
   </>}
   {sizeTooLarge&&<Alert tone="error">This multiplier exceeds the 24 MP or 12,000 px output limit. Choose a lower multiplier or a smaller source.</Alert>}
   {!workspace&&<p className="ai-task-cost"><strong>{credits} AI credits</strong> per successful {kind==='upscale'?'enhancement':'image'} · technical failures release the reservation</p>}
   {workspace?<details className="workspace-processing"><summary>Processing & safety details</summary><p>Your {kind==='generate'?'prompt':'input'} and result are screened by Sightengine; fal and its model provider perform AI processing. Blocked or unverified results are not delivered. Reserved credits are released on failure. Site copies expire 24 hours after task creation; provider retention is described in our <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p></details>:<p className="ai-hint">Prompts, uploaded images and results are screened for sexual, graphic and hateful content. Blocked or unverified results are not delivered; reserved AI credits are released.</p>}
   {ready&&!insufficient&&<label className="check ai-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{workspace?<>I agree to cloud {kind==='upscale'?'enhancement':kind==='edit'?'editing':'generation'} by fal and its model provider, and input/output safety checks by Sightengine. Site copies expire after 24 hours. <a href="/privacy" target="_blank" rel="noopener">Details</a></>:<>I agree to send {kind==='generate'?'this prompt':'a working copy of this image'+(kind==='edit'?' and prompt':'')} to Sightengine for safety checks and to fal and its model provider for AI processing. Results are also checked by Sightengine. Website copies expire after 24 hours. <a href="/privacy" target="_blank" rel="noopener">Data details</a></>}</span></label>}
   {insufficient&&<div className="ai-credit-needed"><strong>This task needs {credits} AI credits. You have {available}.</strong><p>Get a one-time credit pack, then return to this image. Cloud PDF credits are separate.</p></div>}
   {!auth.user&&auth.status==='ready'?<a className="button ai-primary-action" href={'/api/auth/google?return_to='+encodeURIComponent(returnTo||aiTaskUrl(kind))} target="_blank" rel="noopener" aria-disabled={!auth.available} onClick={e=>{if(!auth.available)e.preventDefault();}}>{actionLabel}<ArrowRight size={16} aria-hidden="true"/></a>:<B className="wide ai-primary-action" disabled={auth.status==='loading'||!!current||busy||!!sizeTooLarge||missingInput||auth.status!=='error'&&(!ready||!insufficient&&!consent)} onClick={auth.status==='error'?auth.refresh:start}>{actionLabel}<Sparkle size={16} aria-hidden="true"/></B>}
  </fieldset>
  {error&&<Alert tone="error">{error}</Alert>}{notice&&<p className="ai-notice" role="status">{notice}</p>}
  {!workspace&&feedback&&<div className={'ai-task-summary '+feedback.tone}><strong>{feedback.title}</strong><p>{feedback.creditText}</p>{feedbackJob.can_download&&!result&&<B secondary disabled={busy} onClick={()=>openResult(feedbackJob)}>Open enhanced image</B>}{feedbackJob.status==='failed'&&<p>{aiMessage(feedbackJob.error)} <button className="text-button" onClick={account.refresh}>Refresh task status</button></p>}</div>}
  {current&&<div className="ai-current">{current.status==='awaiting_upload'&&attempt.current&&<B secondary disabled={busy} onClick={start}>Retry upload</B>}<button className="text-button" disabled={busy} onClick={()=>cancel(current)}>Cancel task</button></div>}
  {workspace&&hosts?.footer?createPortal(resultContent,hosts.footer):resultContent}
  {applied&&onUndo&&<button className="text-button" onClick={onUndo}><ArrowClockwise size={16}/>Remove AI result and use original</button>}
  {!workspace&&historyContent}
  {creditOpen&&<AiCreditDialog onClose={closeCredits}><AiPlans checkout onCheckout={value=>{checkout.current={...value,balanceBefore:available};}}/><button className="text-button" onClick={()=>account.refresh()}>Refresh my AI balance</button></AiCreditDialog>}
 </div>;
}
