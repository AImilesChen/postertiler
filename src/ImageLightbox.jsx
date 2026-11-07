import React,{useCallback,useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Minus,Plus,X} from '@phosphor-icons/react';
import './image-lightbox.css';

export default function ImageLightbox({images,initialIndex=0,initialDetail=false,onClose}){
 const dialog=useRef(null),stage=useRef(null),close=useRef(null),pointers=useRef(new Map()),gesture=useRef(null),view=useRef(null),title=useId();
 const [index,setIndex]=useState(initialIndex),[natural,setNatural]=useState({}),[box,setBox]=useState({width:0,height:0}),[zoom,setZoom]=useState(initialDetail?1:null),[pan,setPan]=useState({x:0,y:0});
 const image=images[index],width=natural[image.url]?.width||image.width||1,height=natural[image.url]?.height||image.height||1;
 const fit=Math.min(1,Math.max(1,box.width-48)/width,Math.max(1,box.height-48)/height),scale=zoom??fit;
 view.current={scale,pan};
 const bounded=useCallback((point,value)=>({x:Math.max(-Math.max(0,(width*value-box.width)/2),Math.min(Math.max(0,(width*value-box.width)/2),point.x)),y:Math.max(-Math.max(0,(height*value-box.height)/2),Math.min(Math.max(0,(height*value-box.height)/2),point.y))}),[width,height,box.width,box.height]);
 const changeZoom=useCallback((value,point={x:0,y:0})=>{
  const next=Math.max(Math.min(fit,.1),Math.min(8,value)),before=view.current;
  const position=bounded({x:point.x-(point.x-before.pan.x)*next/before.scale,y:point.y-(point.y-before.pan.y)*next/before.scale},next);
  view.current={scale:next,pan:position};setZoom(next);setPan(position);
 },[fit,bounded]);
 function reset(){setZoom(null);setPan({x:0,y:0});}
 function select(value){setIndex(value);reset();pointers.current.clear();gesture.current=null;}
 useEffect(()=>{
  const previous=document.activeElement,overflow=document.body.style.overflow,padding=document.body.style.paddingRight;
  const gutter=window.innerWidth-document.documentElement.clientWidth;
  if(gutter>0)document.body.style.paddingRight=(parseFloat(getComputedStyle(document.body).paddingRight)+gutter)+'px';
  document.body.style.overflow='hidden';dialog.current.showModal();close.current.focus();
  return()=>{dialog.current?.close();document.body.style.overflow=overflow;document.body.style.paddingRight=padding;if(previous?.isConnected)previous.focus();};
 },[]);
 useEffect(()=>{
  const observer=new ResizeObserver(([entry])=>setBox({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(stage.current);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{setPan(point=>bounded(point,scale));},[bounded,scale]);
 useEffect(()=>{
  const target=stage.current;
  const wheel=event=>{event.preventDefault();const rect=target.getBoundingClientRect();changeZoom(view.current.scale*Math.exp(-Math.max(-100,Math.min(100,event.deltaY))*.0025),{x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2});};
  target.addEventListener('wheel',wheel,{passive:false});return()=>target.removeEventListener('wheel',wheel);
 },[changeZoom]);
 function rebase(){
  const points=[...pointers.current.values()],current=view.current;
  if(points.length===2){const [a,b]=points;gesture.current={distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},...current};}
  else if(points.length===1)gesture.current={start:points[0],...current};else gesture.current=null;
 }
 function down(event){if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});rebase();}
 function move(event){
  if(!pointers.current.has(event.pointerId))return;
  pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const points=[...pointers.current.values()],base=gesture.current;if(!base)return;
  if(points.length===2&&base.distance){
   const [a,b]=points,rect=stage.current.getBoundingClientRect(),next=Math.max(Math.min(fit,.1),Math.min(8,base.scale*Math.hypot(a.x-b.x,a.y-b.y)/base.distance));
   const point={x:base.center.x-rect.left-rect.width/2,y:base.center.y-rect.top-rect.height/2};
   const position=bounded({x:(a.x+b.x)/2-rect.left-rect.width/2-(point.x-base.pan.x)*next/base.scale,y:(a.y+b.y)/2-rect.top-rect.height/2-(point.y-base.pan.y)*next/base.scale},next);
   view.current={scale:next,pan:position};setZoom(next);setPan(position);
  }else if(points.length===1&&base.start){const position=bounded({x:base.pan.x+event.clientX-base.start.x,y:base.pan.y+event.clientY-base.start.y},view.current.scale);view.current.pan=position;setPan(position);}
 }
 function up(event){pointers.current.delete(event.pointerId);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);rebase();}
 function keys(event){
  if(event.key==='Tab'){
   const items=[...dialog.current.querySelectorAll('button:not(:disabled),[tabindex="0"]')],first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   return;
  }
  if(event.key==='+'||event.key==='='){event.preventDefault();changeZoom(view.current.scale*1.25);}
  if(event.key==='-'){event.preventDefault();changeZoom(view.current.scale/1.25);}
  if(event.key==='0'){event.preventDefault();reset();}
  const direction={ArrowLeft:{x:60,y:0},ArrowRight:{x:-60,y:0},ArrowUp:{x:0,y:60},ArrowDown:{x:0,y:-60}}[event.key];
  if(direction){event.preventDefault();setPan(point=>bounded({x:point.x+direction.x,y:point.y+direction.y},view.current.scale));}
 }
 return createPortal(<dialog ref={dialog} className="image-lightbox" aria-labelledby={title} data-clarity-mask="true" onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={keys} onClick={event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();}}}>
  <header className="image-lightbox-heading"><div><h2 id={title}>Image preview</h2><p>{image.label} · {width} × {height} px</p></div><button ref={close} type="button" aria-label="Close image preview" onClick={onClose}><X size={23}/></button></header>
  <div className="image-lightbox-toolbar">{images.length>1&&<div role="group" aria-label="Preview image">{images.map((item,value)=><button type="button" key={item.url} aria-pressed={index===value} onClick={()=>select(value)}>{item.label}</button>)}</div>}<div role="group" aria-label="Image zoom"><button type="button" aria-pressed={zoom===null} onClick={reset}>Fit to window</button><button type="button" aria-pressed={zoom===1} onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>100%</button><button type="button" aria-label="Zoom out" onClick={()=>changeZoom(view.current.scale/1.25)} disabled={scale<=Math.min(fit,.1)}><Minus size={19}/></button><output aria-label="Zoom level">{Math.round(scale*100)}%</output><button type="button" aria-label="Zoom in" onClick={()=>changeZoom(view.current.scale*1.25)} disabled={scale>=8}><Plus size={19}/></button></div></div>
  <div ref={stage} className="image-lightbox-stage" role="region" aria-label="Image canvas. Drag to pan; use zoom controls to enlarge." tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{cursor:width*scale>box.width||height*scale>box.height?'grab':'default'}}><div className="image-lightbox-image" style={{width:width*scale,height:height*scale,transform:`translate(calc(-50% + ${pan.x}px),calc(-50% + ${pan.y}px))`}}><img key={image.url} src={image.url} alt={image.label} draggable="false" onLoad={event=>{const {naturalWidth,naturalHeight}=event.currentTarget;setNatural(values=>({...values,[image.url]:{width:naturalWidth,height:naturalHeight}}));}}/></div></div>
  <p className="image-lightbox-help">Scroll or pinch to zoom · Drag to move · Esc to close. Viewing does not change your image.</p>
 </dialog>,document.body);
}
