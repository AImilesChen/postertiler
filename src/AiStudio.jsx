import React,{useEffect,useRef,useState} from 'react';
import { ArrowLeft,Sparkle } from '@phosphor-icons/react';
import AccountGate from './AccountGate';
import AiTools,{AiPlans,AiOrders} from './AiTools';
import Editor from './Editor';
import './account-workspace.css';
export default function AiStudio(){return <AccountGate returnTo="/account/ai"><Studio/></AccountGate>;}
function Studio(){const editor=useRef(null),[hasImage,setHasImage]=useState(false),[pending,setPending]=useState(null);
 useEffect(()=>{if(pending&&editor.current){editor.current.useAiImage(pending);document.getElementById('ai-poster-workspace')?.scrollIntoView({block:'start',behavior:'smooth'});}},[pending]);
 async function apply(blob){setHasImage(true);setPending(blob);}
 return <main className="ai-studio-page" data-clarity-mask="true"><a className="underlined" href="/account"><ArrowLeft size={16}/>Your account</a><header className="workspace-heading"><div><span className="account-eyebrow">YOUR AI STUDIO</span><h1>From an idea to your wall.</h1><p>Create with GPT Image 2, edit an image or enhance its resolution. Then prepare the printable sheets.</p></div><Sparkle size={32} weight="light"/></header><div className="ai-studio-grid"><section className="account-panel"><h2>Create, edit or enhance</h2><AiTools onApply={apply}/></section><aside><div id="ai-credit-packs"><AiPlans checkout/></div><section className="ai-studio-note"><h2>One image. Your print plan.</h2><p>AI creates or enhances the image. The free poster maker calculates its physical size, paper layout and printable PDF.</p><p>There is no automatic AI subscription. Successful tasks use the credits shown before you start. Technical failures return the reservation.</p><a href="/#poster-editor">Use the free maker</a></section></aside></div><AiOrders/>{hasImage&&<section id="ai-poster-workspace"><h2>Prepare your poster</h2><p>The AI image is ready in the editor. Printing dimensions remain your choice.</p><Editor ref={editor}/></section>}</main>;
}
