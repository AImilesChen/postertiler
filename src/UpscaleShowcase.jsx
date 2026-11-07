import React,{useId,useRef,useState} from 'react';
import {ArrowRight,ArrowsHorizontal,Sparkle} from '@phosphor-icons/react';
import {aiTaskUrl} from './ai-navigation';
import './upscale-showcase.css';

const cases=[
 {id:'cat',title:'A closer look at fur',description:'Compare the fine fur around the eye and the whisker edges.',width:250,height:333,factor:4,focus:'45% 32%',credit:'Miscellaneous contributor',source:'https://commons.wikimedia.org/wiki/File:Closeup_of_a_black_cat.jpg'},
 {id:'kingfisher',title:'Colour, feathers and fine edges',description:'Inspect the feather texture and the outline of the beak.',width:330,height:209,factor:4,focus:'56% 39%',credit:'Foundry',source:'https://commons.wikimedia.org/wiki/File:Kingfisher-bird-863495.jpg'},
];

function Example({item}){
 const [position,setPosition]=useState(50),[detail,setDetail]=useState(true),stage=useRef(null),id=useId();
 const base='/assets/upscale-cases/'+item.id;
 const move=event=>{const rect=stage.current.getBoundingClientRect();setPosition(Math.round(Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100))));};
 return <article className="upscale-example" aria-labelledby={id}>
  <div className="upscale-example-toolbar"><span>REAL AI RESULT · {item.factor}×</span><div role="group" aria-label={item.title+' framing'}><button aria-pressed={detail} onClick={()=>setDetail(true)}>Detail crop</button><button aria-pressed={!detail} onClick={()=>setDetail(false)}>Whole image</button></div></div>
  <div ref={stage} className={'upscale-comparison '+(detail?'is-detail':'')} style={{'--split':position+'%','--focus':item.focus}} onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);move(event);}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))move(event);}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
   <div className="upscale-image-layer"><img src={base+'-enhanced.webp'} alt={item.title+' — actual AI-enhanced result'} width={item.width*item.factor} height={item.height*item.factor} loading="lazy" decoding="async" draggable="false"/></div>
   <div className="upscale-image-layer upscale-original-layer" style={{clipPath:`inset(0 ${100-position}% 0 0)`}}><img src={base+'-source.jpg'} alt={item.title+' — low-resolution source'} width={item.width} height={item.height} loading="lazy" decoding="async" draggable="false"/></div>
   <span className="upscale-image-label before">Original</span><span className="upscale-image-label after">AI enhanced</span><span className="upscale-split-line" aria-hidden="true"><span><ArrowsHorizontal size={20}/></span></span>
  </div>
  <label className="upscale-range"><span>Drag to compare</span><input type="range" min="0" max="100" value={position} onChange={event=>setPosition(Number(event.target.value))} aria-label={item.title+' before and after'} aria-valuetext={`${position}% original, ${100-position}% enhanced`}/></label>
  <h3 id={id}>{item.title}</h3><p>{item.description}</p><p className="upscale-pixels"><span>Original <strong>{item.width} × {item.height} px</strong></span><ArrowRight size={18} aria-hidden="true"/><span>Enhanced <strong>{item.width*item.factor} × {item.height*item.factor} px</strong></span></p>
  <small className="upscale-attribution">Source photo: <a href={item.source} target="_blank" rel="noopener noreferrer">{item.credit}</a> · CC0 · reduced-resolution input.</small>
 </article>;
}

export default function UpscaleShowcase(){
 return <section className="hp-section upscale-showcase" id="image-upscaling" aria-labelledby="upscale-showcase-title">
  <header className="hp-heading hp-heading-split"><div><small><Sparkle size={16} aria-hidden="true"/> OPTIONAL AI IMAGE UPSCALER</small><h2 id="upscale-showcase-title">Enlarge your image before printing.</h2><p>A small source can look soft in a large poster. Explore real enhancement results up close, then decide what works for your image.</p></div><a className="button" href={aiTaskUrl('upscale')}>Enhance your image <ArrowRight size={17} aria-hidden="true"/></a></header>
  <div className="upscale-showcase-intro"><p>Choose an image <span>→</span> Enhance 2× or 4× <span>→</span> Compare and use it in your poster</p><small>Optional cloud AI · 3 AI credits per enhancement · Invite-only pilot</small></div>
  <div className="upscale-example-grid">{cases.map(item=><Example key={item.id} item={item}/>)}</div>
  <p className="hp-footnote">Actual Topaz Standard V2 results from the same enhancement service used in our tool. Both sides use the same framing and display size; the original is enlarged for comparison. Input photos were reduced in resolution to demonstrate upscaling. Previews are web-optimized without additional sharpening. More pixels do not guarantee recovered detail or a particular print quality. Results vary by image.</p>
  <div className="upscale-showcase-footer"><p>Your free poster PDF is still free. AI enhancement is optional.</p><a className="underlined" href="/pricing#ai-plans">See AI credits and pricing <ArrowRight size={17} aria-hidden="true"/></a></div>
 </section>;
}
