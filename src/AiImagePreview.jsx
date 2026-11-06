import React, { useEffect,useRef,useState } from 'react';
import { ArrowsHorizontal,ImageSquare } from '@phosphor-icons/react';
import AiJobStatus from './AiJobStatus';

export default function AiImagePreview({source,result,sourcePixels,resultPixels,job,onRefresh,onOpenResult,busy}) {
 const [detail,setDetail]=useState(false),[split,setSplit]=useState(50),[view,setView]=useState('compare'),stage=useRef(null);
 useEffect(()=>{setDetail(false);setSplit(50);},[source,result]);
 const comparison=!!(source&&result),ratio=(resultPixels?.width||sourcePixels?.width||3)/(resultPixels?.height||sourcePixels?.height||4);
 function move(event){const box=stage.current.getBoundingClientRect();setSplit(Math.max(0,Math.min(100,(event.clientX-box.left)/box.width*100)));}
 const pixels=resultPixels||sourcePixels;
 return <section className="ai-image-preview" aria-label="AI image preview"><header><div><strong>{comparison?'Before & after':result?'Your enhanced image':'Your image preview'}</strong><small>{comparison?'Drag the divider to compare your original with the real AI result.':result?'Download this result or apply it to your poster.':source?'The original is shown here. Your enhanced result will appear when processing succeeds.':'Choose an image to see it here.'}</small></div>{result&&<button aria-pressed={detail} onClick={()=>setDetail(value=>!value)}>{detail?'Fit preview':'100% detail'}</button>}</header>
  <AiJobStatus job={job} onRefresh={onRefresh} onOpenResult={onOpenResult} hasResult={!!result} busy={busy}/>
  {comparison&&<div className="ai-comparison-toolbar"><div role="group" aria-label="Comparison view"><button aria-pressed={view==='compare'} onClick={()=>setView('compare')}>Compare slider</button><button aria-pressed={view==='side'} onClick={()=>setView('side')}>Side by side</button></div><span>{sourcePixels?.width} × {sourcePixels?.height} → {resultPixels?.width} × {resultPixels?.height} px</span></div>}
  {comparison&&view==='compare'?<><div className={'ai-compare-viewport '+(detail?'detail-view':'')}><div ref={stage} className="ai-compare-stage" style={{'--image-ratio':ratio,...(detail?{width:resultPixels.width,maxWidth:'none'}:{})}} onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.setPointerCapture(event.pointerId);move(event);}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))move(event);}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
   <img src={result} alt="AI image result" draggable="false"/><img src={source} alt="Original image before AI processing" draggable="false" style={{clipPath:`inset(0 ${100-split}% 0 0)`}}/>
   <div className="ai-compare-label before">Before</div><div className="ai-compare-label after">Enhanced</div><div className="ai-compare-divider" style={{left:split+'%'}}><span><ArrowsHorizontal size={23}/></span></div>
  </div></div><div className="ai-comparison-controls"><label>Before / after comparison<input type="range" min="0" max="100" value={split} onChange={event=>setSplit(Number(event.target.value))} aria-label="Before and after comparison" aria-valuetext={`${split}% original, ${100-split}% enhanced`}/></label><small>{detail?'100% result pixels. Scroll to inspect fine detail.':'Both images are aligned at the same display size. Use 100% detail to inspect the difference.'}</small></div></>:<div className={`ai-preview-images ${comparison?'has-comparison':''}`}>
   {source&&<figure><figcaption>Original{sourcePixels?.width?` · ${sourcePixels.width} × ${sourcePixels.height} px`:''}</figcaption><div className={detail?'actual-size':''}><img src={source} alt="Original image before AI processing" style={detail&&pixels?{width:pixels.width,maxWidth:'none'}:undefined}/></div></figure>}
   {result&&<figure><figcaption>Enhanced · {resultPixels?.width} × {resultPixels?.height} px</figcaption><div className={detail?'actual-size':''}><img src={result} alt="AI image result" style={detail&&pixels?{width:pixels.width,maxWidth:'none'}:undefined}/></div></figure>}
   {!source&&!result&&<div className="ai-preview-empty"><ImageSquare size={45} weight="light"/><h3>See the difference in your own image</h3><p>Upload an image and enhance it. Your real result will appear here with a draggable before-and-after comparison.</p></div>}
  </div>}
 </section>;
}
