import React,{useEffect,useRef,useState} from 'react';
import { ArrowLeft,Sparkle } from '@phosphor-icons/react';
import AccountGate from './AccountGate';
import { useAuth } from './AuthContext';
import AiTools,{AiOrders} from './AiTools';
import AiImagePreview from './AiImagePreview';
import AiCheckoutReturn from './AiCheckoutReturn';
import { AI_TASKS,aiTaskFromSearch,aiTaskUrl } from './ai-navigation';
import Editor from './Editor';
import './account-workspace.css';

export default function AiStudio(){
 const auth=useAuth(),editor=useRef(null),[task,setTask]=useState('upscale'),[hasImage,setHasImage]=useState(false),[pending,setPending]=useState(null),[preview,setPreview]=useState(null),[checkoutReturn,setCheckoutReturn]=useState(null);
 useEffect(()=>{function read(){setTask(aiTaskFromSearch(location.search));const q=new URLSearchParams(location.search),id=q.get('billing_order');setCheckoutReturn(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||'')?{orderId:id}:q.get('billing_canceled')==='1'?{canceled:true}:null);}read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[]);
 useEffect(()=>{document.title=AI_TASKS[task].title+' | PosterTiler';},[task]);
 useEffect(()=>{if(pending&&editor.current){editor.current.useAiImage(pending);document.getElementById('ai-poster-workspace')?.scrollIntoView({block:'start',behavior:'smooth'});}},[pending]);
 function choose(event,value){if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();history.pushState(null,'',aiTaskUrl(value));setTask(value);}
 async function apply(blob){setHasImage(true);setPending(blob);}
 if(checkoutReturn){const destination=checkoutReturn.orderId?'/account/ai?billing_order='+checkoutReturn.orderId:'/account/ai?billing_canceled=1';return <AccountGate returnTo={destination}><AiCheckoutReturn {...checkoutReturn}/></AccountGate>;}
 return <main className="ai-studio-page ai-workflow-page" data-clarity-mask="true"><a className="underlined" href="/account"><ArrowLeft size={16}/>Your account</a><header className="workspace-heading"><div><span className="account-eyebrow">OPTIONAL AI TOOLS</span><h1>{AI_TASKS[task].title}</h1><p>{AI_TASKS[task].description}</p></div><Sparkle size={32} weight="light" aria-hidden="true"/></header>
  <nav className="ai-mode-nav" aria-label="AI image tools">{Object.entries(AI_TASKS).map(([value,data])=><a key={value} href={aiTaskUrl(value)} aria-current={value===task?'page':undefined} onClick={event=>choose(event,value)}>{data.title}</a>)}</nav>
  <div className="ai-pilot-inline">Private pilot · AI access requires an invited account. Credit purchases currently use Stripe test checkout.</div>
  <div className="ai-focused-grid"><section className="ai-tool-panel" aria-label={AI_TASKS[task].title+' controls'}><h2>{task==='upscale'?'Enhance your image':task==='edit'?'Edit your image':'Create your artwork'}</h2><AiTools task={task} onApply={apply} onPreview={setPreview}/></section><AiImagePreview {...preview}/></div>
  {auth.user&&<details className="ai-orders-details"><summary>AI credit orders</summary><AiOrders/></details>}
  {hasImage&&<section id="ai-poster-workspace"><h2>Prepare your poster</h2><p>Your AI image is in the free poster maker. Choose its paper and finished dimensions.</p><Editor ref={editor}/></section>}
 </main>;
}
