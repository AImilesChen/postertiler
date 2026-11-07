import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight} from '@phosphor-icons/react';
import AccountGate from './AccountGate';
import {useAuth} from './AuthContext';
import AiTools,{AiOrders} from './AiTools';
import AiImagePreview from './AiImagePreview';
import AiCheckoutReturn from './AiCheckoutReturn';
import {AI_TASKS,AI_PUBLIC_PAGES,AI_UPSCALER_URL,aiPublicTask,aiTaskFromSearch,aiTaskUrl,aiToolUrl} from './ai-navigation';
import {activeAi} from './ai-job-state';
import {trackEvent} from './analytics';
import Editor from './Editor';
import UpscalerContent from './UpscalerContent';
import GeneratorContent from './GeneratorContent';
import './account-workspace.css';
import './ai-workbench.css';

export default function AiStudio({publicPage=false,initialTask='upscale'}){
 const auth=useAuth(),editor=useRef(null),[task,setTask]=useState(initialTask),[hasImage,setHasImage]=useState(false),[pending,setPending]=useState(null),[preview,setPreview]=useState(null),[checkoutReturn,setCheckoutReturn]=useState(null),[promptPreset,setPromptPreset]=useState(null);
 useEffect(()=>{function read(){const publicTask=aiPublicTask(location.pathname);setTask(publicTask||aiTaskFromSearch(location.search));const q=new URLSearchParams(location.search),id=q.get('billing_order');setCheckoutReturn(!publicTask&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||'')?{orderId:id}:!publicTask&&q.get('billing_canceled')==='1'?{canceled:true}:null);}read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[]);
 useEffect(()=>{document.title=(publicPage?AI_PUBLIC_PAGES[task]?.title||AI_TASKS[task].title:AI_TASKS[task].title)+' | PosterTiler';},[task,publicPage]);
 useEffect(()=>{if(pending&&editor.current){editor.current.useAiImage(pending);document.getElementById('ai-poster-workspace')?.scrollIntoView({block:'start',behavior:'smooth'});}},[pending]);
 const taskBusy=!!(preview?.busy||preview?.job&&activeAi(preview.job));
 function navigate(value){if(taskBusy)return;setTask(value);history.pushState(null,'',aiToolUrl(value));window.dispatchEvent(new PopStateEvent('popstate'));trackEvent('page_view');}
 function choose(event,value){if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(value);}
 function usePrompt(item){if(taskBusy)return;setPromptPreset({prompt:item.prompt,size:item.size,nonce:Date.now()});document.getElementById('ai-workspace')?.scrollIntoView({block:'start',behavior:'smooth'});}
 async function apply(blob){setHasImage(true);setPending(blob);}
 if(checkoutReturn){const destination=checkoutReturn.orderId?'/account/ai?billing_order='+checkoutReturn.orderId:'/account/ai?billing_canceled=1';return <AccountGate returnTo={destination}><AiCheckoutReturn {...checkoutReturn}/></AccountGate>;}
 return <main id="ai-studio-page" className={'ai-studio-page ai-workflow-page ai-redesigned '+(publicPage?'ai-public-page':'ai-private-page')+(task==='generate'?' ai-generator-workspace':'')}>
  {!publicPage&&<a className="underlined ai-account-back" href="/account"><ArrowLeft size={16}/>Your account</a>}
  <header className="ai-page-heading"><div><h1>{task==='generate'?'AI Image Generator for Posters':AI_TASKS[task].title}</h1><p>{task==='generate'?'Describe your artwork. Create an image. Turn it into a printable poster.':publicPage?'Enlarge your image 2× or 4×. Compare the details, then make a bigger print.':AI_TASKS[task].description}</p></div>{task==='generate'?<a className="underlined" href="#generator-ideas">Explore prompt ideas <ArrowRight size={17}/></a>:publicPage&&<a className="underlined" href="#upscaler-examples">See real results <ArrowRight size={17}/></a>}</header>
  <nav className="ai-secondary-modes" aria-label="AI image tools">{Object.entries(AI_TASKS).map(([value,data])=><a key={value} href={aiToolUrl(value)} aria-current={value===task?'page':undefined} aria-disabled={taskBusy&&value!==task?true:undefined} onClick={event=>choose(event,value)}>{data.title}</a>)}</nav>
  <p className="ai-pilot-banner"><strong>Private pilot</strong> Invited accounts only · Credit purchases use Stripe test checkout.</p>
  <div id="ai-workspace"/><section className="ai-workbench" id="upscale-tool" aria-label={AI_TASKS[task].title+' workspace'} data-clarity-mask="true">
   <header className="ai-workbench-header"><h2>{task==='upscale'?'Enhance your image':task==='edit'?'Edit your image':'Create your artwork'}</h2><div id="ai-workbench-toolbar"/></header>
   <div className="ai-focused-grid"><section className="ai-tool-panel" aria-label={AI_TASKS[task].title+' controls'}><AiTools task={task} workspace returnTo={publicPage?aiToolUrl(task):aiTaskUrl(task)} onApply={apply} onPreview={setPreview} promptPreset={promptPreset} onUsePrompt={usePrompt} onTaskChange={navigate}/></section><AiImagePreview {...preview} task={task} workspace showExample={task==='upscale'} onUsePrompt={usePrompt} taskBusy={taskBusy}/></div>
   <div id="ai-workbench-results" className="ai-workbench-footer"><p className="ai-workbench-default-note">{task==='generate'?'Your image appears here after generation. Review it before making a poster.':'Your original stays unchanged. Review the result before printing.'}</p></div>
  </section>
  {hasImage&&<section id="ai-poster-workspace" data-clarity-mask="true"><h2>Prepare your poster</h2><p>Your AI image is in the free poster maker. Choose its paper and finished dimensions.</p><Editor ref={editor}/></section>}
  {!publicPage&&auth.user&&<details className="ai-orders-details" data-clarity-mask="true"><summary>AI credit orders</summary><AiOrders/></details>}
  {task==='generate'?<GeneratorContent onUsePrompt={usePrompt} disabled={taskBusy}/>:publicPage?<UpscalerContent/>:<p className="ai-public-link"><a className="underlined" href={AI_UPSCALER_URL}>How AI enhancement works <ArrowRight size={17}/></a></p>}
 </main>;
}
