import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight} from '@phosphor-icons/react';
import AccountGate from './AccountGate';
import {useAuth} from './AuthContext';
import AiTools,{AiOrders} from './AiTools';
import AiImagePreview from './AiImagePreview';
import AiCheckoutReturn from './AiCheckoutReturn';
import {AI_TASKS,AI_UPSCALER_URL,aiTaskFromSearch,aiTaskUrl} from './ai-navigation';
import Editor from './Editor';
import UpscalerContent from './UpscalerContent';
import './account-workspace.css';
import './ai-workbench.css';

export default function AiStudio({publicPage=false}){
 const auth=useAuth(),editor=useRef(null),[task,setTask]=useState('upscale'),[hasImage,setHasImage]=useState(false),[pending,setPending]=useState(null),[preview,setPreview]=useState(null),[checkoutReturn,setCheckoutReturn]=useState(null);
 useEffect(()=>{function read(){if(publicPage){setTask('upscale');return;}setTask(aiTaskFromSearch(location.search));const q=new URLSearchParams(location.search),id=q.get('billing_order');setCheckoutReturn(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||'')?{orderId:id}:q.get('billing_canceled')==='1'?{canceled:true}:null);}read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[publicPage]);
 useEffect(()=>{document.title=(publicPage?'AI Image Upscaler — Enlarge Images for Printing':AI_TASKS[task].title)+' | PosterTiler';},[task,publicPage]);
 useEffect(()=>{if(pending&&editor.current){editor.current.useAiImage(pending);document.getElementById('ai-poster-workspace')?.scrollIntoView({block:'start',behavior:'smooth'});}},[pending]);
 function choose(event,value){if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();history.pushState(null,'',aiTaskUrl(value));setTask(value);}
 async function apply(blob){setHasImage(true);setPending(blob);}
 if(checkoutReturn){const destination=checkoutReturn.orderId?'/account/ai?billing_order='+checkoutReturn.orderId:'/account/ai?billing_canceled=1';return <AccountGate returnTo={destination}><AiCheckoutReturn {...checkoutReturn}/></AccountGate>;}
 return <main id="ai-studio-page" className={'ai-studio-page ai-workflow-page ai-redesigned '+(publicPage?'ai-public-page':'ai-private-page')}>
  {!publicPage&&<a className="underlined ai-account-back" href="/account"><ArrowLeft size={16}/>Your account</a>}
  <header className="ai-page-heading"><div><h1>{AI_TASKS[task].title}</h1><p>{publicPage?'Enlarge your image 2× or 4×. Compare the details, then make a bigger print.':AI_TASKS[task].description}</p></div>{publicPage&&<a className="underlined" href="#upscaler-examples">See real results <ArrowRight size={17}/></a>}</header>
  <nav className="ai-secondary-modes" aria-label="AI image tools">{Object.entries(AI_TASKS).map(([value,data])=><a key={value} href={publicPage&&value==='upscale'?'#upscale-tool':aiTaskUrl(value)} aria-current={value===task?'page':undefined} onClick={publicPage?undefined:event=>choose(event,value)}>{data.title}</a>)}</nav>
  <p className="ai-pilot-banner"><strong>Private pilot</strong> Invited accounts only · Credit purchases use Stripe test checkout.</p>
  <section className="ai-workbench" id="upscale-tool" aria-label={AI_TASKS[task].title+' workspace'} data-clarity-mask="true">
   <header className="ai-workbench-header"><h2>{task==='upscale'?'Enhance your image':task==='edit'?'Edit your image':'Create your artwork'}</h2><div id="ai-workbench-toolbar"/></header>
   <div className="ai-focused-grid"><section className="ai-tool-panel" aria-label={AI_TASKS[task].title+' controls'}><AiTools task={task} workspace returnTo={publicPage?AI_UPSCALER_URL:aiTaskUrl(task)} onApply={apply} onPreview={setPreview}/></section><AiImagePreview {...preview} workspace showExample={task==='upscale'}/></div>
   <div id="ai-workbench-results" className="ai-workbench-footer"><p className="ai-workbench-default-note">Your original stays unchanged. Review the result before printing.</p></div>
  </section>
  {hasImage&&<section id="ai-poster-workspace" data-clarity-mask="true"><h2>Prepare your poster</h2><p>Your enhanced image is in the free poster maker. Choose its paper and finished dimensions.</p><Editor ref={editor}/></section>}
  {!publicPage&&auth.user&&<details className="ai-orders-details" data-clarity-mask="true"><summary>AI credit orders</summary><AiOrders/></details>}
  {publicPage?<UpscalerContent/>:<p className="ai-public-link"><a className="underlined" href={AI_UPSCALER_URL}>How AI enhancement works <ArrowRight size={17}/></a></p>}
 </main>;
}
