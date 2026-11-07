import React,{useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,ArrowsHorizontal,ArrowsOut,Sparkle,X} from '@phosphor-icons/react';
import {aiTaskUrl} from './ai-navigation';
import './upscale-showcase.css';

const cases=[
 {id:'garden',title:'Japanese garden',width:360,height:235,factor:2,focus:'52% 45%',credit:'Mike Lewis · Wikimedia Commons',license:'CC0',source:'https://commons.wikimedia.org/wiki/File:The_Japanese_Garden_(Unsplash).jpg'},
 {id:'flowers',title:'Painted florals',width:300,height:360,factor:4,focus:'50% 42%',credit:'Vincent van Gogh · The Metropolitan Museum of Art',license:'Public domain',source:'https://www.metmuseum.org/art/collection/search/436525'},
];
const asset=(item,suffix)=>'/assets/upscale-cases/'+item.id+suffix;

function Comparison({item,detail=false}){
 const [position,setPosition]=useState(50),[failed,setFailed]=useState(false);
 return <div className={'upscale-comparison '+(detail?'is-detail':'')} style={{'--split':position+'%','--focus':item.focus,'--art-ratio':item.width/item.height}}>
  <div className="upscale-art-frame">
   <div className="upscale-image-layer"><img src={asset(item,'-enhanced.webp')} alt={item.title+' — actual AI-enhanced result'} width={item.width*item.factor} height={item.height*item.factor} loading="lazy" decoding="async" draggable="false" onError={()=>setFailed(true)}/></div>
   <div className="upscale-image-layer upscale-original-layer" style={{clipPath:`inset(0 ${100-position}% 0 0)`}}><img src={asset(item,'-source.jpg')} alt={item.title+' — low-resolution source'} width={item.width} height={item.height} loading="lazy" decoding="async" draggable="false" onError={()=>setFailed(true)}/></div>
   <span className="upscale-image-label before">Before</span><span className="upscale-image-label after">After</span>
   <span className="upscale-split-line" aria-hidden="true"><span><ArrowsHorizontal size={20}/></span></span>
   <input className="upscale-compare-control" type="range" min="0" max="100" value={position} onChange={event=>setPosition(Number(event.target.value))} aria-label={item.title+' before and after'} aria-valuetext={`${position}% original, ${100-position}% enhanced`}/>
  </div>
  {failed&&<p className="upscale-image-error" role="status">This preview could not load. Please refresh to try again.</p>}
 </div>;
}

function DetailView({item,onClose}){
 const dialog=useRef(null),[detail,setDetail]=useState(true),titleId=useId();
 useEffect(()=>{
  const node=dialog.current,previous=document.body.style.overflow,opener=document.activeElement;
  node.showModal();document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=previous;node.close();opener?.focus();};
 },[]);
 return <dialog ref={dialog} className="upscale-detail-dialog" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <header><div><h3 id={titleId}>{item.title}</h3><p>Actual {item.factor}× enhancement · drag to compare</p></div><button className="upscale-close" aria-label="Close image details" onClick={onClose} autoFocus><X size={24}/></button></header>
  <div className="upscale-detail-modes" role="group" aria-label="Comparison framing"><button aria-pressed={detail} onClick={()=>setDetail(true)}>Detail crop</button><button aria-pressed={!detail} onClick={()=>setDetail(false)}>Whole image</button></div>
  <Comparison key={item.id} item={item} detail={detail}/>
  <p className="upscale-dialog-note">{item.width} × {item.height} → {item.width*item.factor} × {item.height*item.factor} px. Both sides show the same area at the same scale.</p>
 </dialog>;
}

export default function UpscaleShowcase(){
 const [selected,setSelected]=useState(0),[expanded,setExpanded]=useState(false),item=cases[selected];
 const close=()=>setExpanded(false);
 return <section className="hp-section upscale-showcase" id="image-upscaling" aria-labelledby="upscale-showcase-title">
  <div className="upscale-showcase-layout">
   <div className="upscale-showcase-copy">
    <p className="upscale-eyebrow"><Sparkle size={20} aria-hidden="true"/> AI IMAGE UPSCALER</p>
    <h2 id="upscale-showcase-title">Small image.<br/> Bigger possibilities.</h2>
    <p className="upscale-description">Give a favourite image more room to grow. Enhance it 2× or 4×, compare the result, then turn it into a poster.</p>
    <a className="button upscale-primary" href={aiTaskUrl('upscale')}>Enhance your image <ArrowRight size={19} aria-hidden="true"/></a>
    <p className="upscale-access">3 AI credits per enhancement<span>Optional cloud AI · Invite-only pilot</span></p>
    <a className="underlined" href="/pricing#ai-plans">See credits & pricing <ArrowRight size={17} aria-hidden="true"/></a>
   </div>
   <div className="upscale-showcase-demo">
    <div className="upscale-demo-heading"><span>Real {item.factor}× result</span><button onClick={()=>setExpanded(true)}><ArrowsOut size={18} aria-hidden="true"/> View detail</button></div>
    <Comparison key={item.id} item={item}/>
    <div className="upscale-demo-caption"><span>{item.width} × {item.height} <ArrowRight size={16} aria-hidden="true"/> {item.width*item.factor} × {item.height*item.factor} px</span><span>Drag to compare</span></div>
    <div className="upscale-case-picker" role="group" aria-label="Choose an enhancement example">{cases.map((example,index)=><button key={example.id} aria-pressed={selected===index} onClick={()=>setSelected(index)}><img src={asset(example,'-enhanced.webp')} alt="" width="64" height="48" loading="lazy"/><span>{example.title}</span></button>)}</div>
   </div>
  </div>
  <div className="upscale-showcase-bottom"><p>Free poster PDFs stay free. Enhancement results vary by image.</p><details className="upscale-example-details"><summary>Example & processing details</summary><div><p>These are real Topaz Standard V2 results from our enhancement tool. Public-domain images were reduced in resolution for the examples. Both sides use identical framing; the original is enlarged for comparison. Previews are web-optimized without additional sharpening. More pixels do not guarantee recovered detail or a particular print quality.</p><ul>{cases.map(example=><li key={example.id}><a href={example.source} target="_blank" rel="noopener noreferrer">{example.title}</a> — {example.credit}. {example.license}.</li>)}</ul></div></details></div>
  {expanded&&<DetailView item={item} onClose={close}/>}
 </section>;
}

