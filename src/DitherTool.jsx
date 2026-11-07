import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowLeft,ArrowCounterClockwise,UploadSimple,DownloadSimple,CornersOut,LockSimple,ImageSquare,Check,ArrowsLeftRight,DotsNine,FilePng} from '@phosphor-icons/react';
import {DITHER_DEFAULTS,DITHER_PRESETS,ditherSize} from './engine/dithering.ts';
import {inspectFile} from './engine/image.ts';
import {loadImage} from './export';
import {ditherExamples,ditherAsset} from './dither-examples';
import useDither from './useDither';
import ImageLightbox from './ImageLightbox';
import Editor from './Editor';
import {trackEvent} from './analytics';
import './dithering.css';

function Slider({label,value,min,max,onChange,suffix=''}){
 return <label className="dt-slider"><span>{label}<output>{value}{suffix}</output></span><input aria-label={label} type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
}
function ExampleCard({example,onTry}){
 const [effect,setEffect]=useState(true);
 return <article className="dt-example"><div className="dt-card-tabs"><button aria-pressed={!effect} onClick={()=>setEffect(false)}>Original</button><button aria-pressed={effect} onClick={()=>setEffect(true)}>Dithered</button></div><div className="dt-case-image"><img src={ditherAsset(example.id,effect?'-effect':'')} alt={example.alt+(effect?', with a dither effect':'')} loading="lazy"/></div><h3>{example.name}</h3><p>{example.artist} · <a href={example.source} target="_blank" rel="noreferrer">The Met Open Access</a></p><button className="underlined" onClick={()=>onTry(example)}>Try this style <ArrowRight size={17}/></button></article>;
}
const faq=[
 ['What is image dithering?','Dithering uses small patterns of pixels to suggest tones between a limited set of colours. It can give a photo a grainy black-and-white, retro or pixel-art look.'],
 ['How is dithering different from halftone dots?','This tool builds its texture from pixels. A halftone screen uses shapes such as dots at different sizes. For a round-dot or CMYK-style screen, try the Halftone Poster Maker.'],
 ['Are my images uploaded?','No. This tool processes your selected file in your browser. Downloading a PNG or preparing an ordinary poster PDF does not send your image to an AI provider.'],
 ['Is this tool free?','Yes. Local dithering, PNG downloads and ordinary poster PDFs are free, without an account or watermark. The optional AI tools elsewhere on the site use separate credits.'],
 ['Can I print the result as a large poster?','Choose Make a poster to carry the processed image into the free print editor. Set the finished size, paper, margins and overlap, then export a tiled PDF. Check the pattern and print one test sheet before the whole poster.'],
 ['Why does the texture look different when I zoom out?','Small patterns can merge or shimmer when a browser scales the image. Use 100% detail to inspect the output pixels. The PNG retains the selected dimensions; changing preview zoom does not change the download.'],
 ['Does dithering make a blurry photo sharper?','It creates an artistic texture and does not restore missing detail. For a larger pixel image, explore the separate AI Image Upscaler, then apply a dither effect if you want that style.'],
];

export default function DitherTool(){
 const input=useRef(null),sequence=useRef(0),editor=useRef(null),workbench=useRef(null),preview=useRef(null),sourceUrl=useRef(null),pendingImport=useRef(null),importedKey=useRef(null);
 const [source,setSource]=useState(null),[options,setOptions]=useState({...DITHER_DEFAULTS}),[edge,setEdge]=useState(0),[view,setView]=useState('effect'),[reading,setReading]=useState(false),[fileError,setFileError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0),[lightbox,setLightbox]=useState(null),[posterOpen,setPosterOpen]=useState(false),[hasPoster,setHasPoster]=useState(false),[cancelled,setCancelled]=useState(false);
 const rendered=useDither(cancelled?null:source,options,edge,retry);
 const ready=rendered.ready&&!reading&&!cancelled,activePreset=DITHER_PRESETS.find(p=>JSON.stringify(p.options)===JSON.stringify(options)),dimensions=source?ditherSize(source.width,source.height,edge):null;
 const editing=rendered.busy&&!cancelled,busy=reading||editing;
 const shown=view==='original'?source?.url:ready?rendered.result.url:source?.url;
 const shownDimensions=view==='original'?source:ready?rendered.result:source;
 useEffect(()=>()=>{++sequence.current;if(sourceUrl.current)URL.revokeObjectURL(sourceUrl.current);},[]);
 async function openBlob(blob,{example=false,title='Your image'}={}){
  const id=++sequence.current;setReading(true);setFileError('');setNotice('');
  let url;
  try{
   await inspectFile(blob);url=URL.createObjectURL(blob);const image=await loadImage(url);
   if(id!==sequence.current){URL.revokeObjectURL(url);return;}
   if(sourceUrl.current)URL.revokeObjectURL(sourceUrl.current);sourceUrl.current=url;
   setSource({blob,url,id,width:image.naturalWidth,height:image.naturalHeight,example,title});setView('effect');setCancelled(false);
   if(!example)trackEvent('tool_start',{tool:'dither'});
  }catch(error){if(url)URL.revokeObjectURL(url);if(id===sequence.current)setFileError(error.message||'This image could not be opened. Try a different JPG, PNG or WebP.');}
  finally{if(id===sequence.current)setReading(false);}
 }
 async function example(item=ditherExamples[0]){
  const id=++sequence.current;setReading(true);setFileError('');
  try{
   const response=await fetch(ditherAsset(item.id));if(!response.ok)throw new Error();const blob=await response.blob();
   if(id!==sequence.current)return;
   setOptions({...DITHER_PRESETS.find(p=>p.id===item.preset).options});setEdge(0);await openBlob(blob,{example:true,title:item.title});
  }catch{if(id===sequence.current){setFileError('The example could not load. Upload your own JPG, PNG or WebP.');setReading(false);}}
 }
 useEffect(()=>{example();return()=>{++sequence.current;};},[]);
 function files(list){if(list.length!==1){setFileError('Choose one image at a time. Your current image is still here.');return;}openBlob(list[0]);}
 useEffect(()=>{
  const paste=event=>{if(posterOpen||!event.clipboardData?.files.length)return;event.preventDefault();files(Array.from(event.clipboardData.files));};
  window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste);
 },[posterOpen]);
 useEffect(()=>{
  if(!posterOpen||!pendingImport.current||!editor.current)return;
  const next=pendingImport.current;pendingImport.current=null;editor.current.useProcessedImage(next.blob).then(success=>{if(success)importedKey.current=next.key;});
  document.getElementById('dither-poster')?.scrollIntoView({block:'start'});
 },[posterOpen,hasPoster]);
 function update(key,value){setOptions(previous=>({...previous,[key]:value,...(key==='algorithm'&&value==='floyd'?{mode:'bw'}:{})}));setCancelled(false);setNotice('');}
 function preset(item){setOptions({...item.options});setCancelled(false);setNotice('');}
 function download(){
  if(!ready)return;
  const link=document.createElement('a');link.href=rendered.result.url;link.download='postertiler-dither.png';document.body.append(link);link.click();link.remove();
  setNotice('PNG download requested. Your source image is unchanged.');trackEvent('image_download',{tool:'dither'});
 }
 async function makePoster(){
  if(!ready)return;
  if(importedKey.current!==rendered.result.key)pendingImport.current={blob:rendered.result.blob,key:rendered.result.key};
  setHasPoster(true);setPosterOpen(true);setNotice('');trackEvent('tool_to_poster',{tool:'dither'});
  if(posterOpen&&pendingImport.current&&editor.current){const next=pendingImport.current;pendingImport.current=null;await editor.current.useProcessedImage(next.blob);importedKey.current=next.key;}
 }
 function inspect(detail=false){if(shown&&shownDimensions)setLightbox({images:[{url:shown,label:view==='original'?'Original image':'Dithered image',width:shownDimensions.width,height:shownDimensions.height}],detail});}
 function reset(){setOptions({...DITHER_DEFAULTS});setEdge(0);setCancelled(false);setView('effect');setNotice('Settings reset. Your image is still here.');}
 function remove(){++sequence.current;setSource(null);setReading(false);setCancelled(false);setFileError('');setNotice('Choose an image or try an example.');if(sourceUrl.current){URL.revokeObjectURL(sourceUrl.current);sourceUrl.current=null;}}
 function tryStyle(item){preset(DITHER_PRESETS.find(p=>p.id===item.preset));if(!source||source.example)example(item);setPosterOpen(false);workbench.current?.scrollIntoView({block:'start'});setNotice(source&&!source.example?'Style applied to your image.':'');}
 return <main className="dither-page">
  <header className="dt-heading"><div><p className="dt-eyebrow"><DotsNine size={18}/>FREE IMAGE TOOL</p><h1>Image Dithering Tool</h1><p>Turn your photo into black-and-white, retro or colour dither art.</p></div><a className="underlined" href="#dither-examples">Explore the looks <ArrowRight size={17}/></a></header>
  <ul className="dt-benefits"><li><FilePng size={20}/>Free PNG downloads</li><li><LockSimple size={20}/>Runs in your browser</li><li><Check size={20}/>No sign-up or watermark</li></ul>
  <section ref={workbench} className="dt-workbench" id="dither-tool" aria-label="Image dithering workspace" data-clarity-mask="true" hidden={posterOpen}>
   <header className="dt-workbench-heading"><h2>Dither your image</h2><button className="dt-text-button" onClick={reset}><ArrowCounterClockwise size={17}/>Reset settings</button></header>
   <div className="dt-workspace">
    <section className="dt-settings" aria-label="Dithering settings">
     <header className="dt-panel-heading"><strong>Image &amp; style</strong><span>{source?.example?'Using an example':source?'Your image':'Choose an image'}</span></header>
     <div className="dt-controls">
      <input ref={input} className="dt-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose source image" onChange={e=>{if(e.target.files.length)files(Array.from(e.target.files));e.target.value='';}}/>
      <div className="dt-upload" onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}} onDrop={e=>{e.preventDefault();files(Array.from(e.dataTransfer.files));}}><button className="button secondary" onClick={()=>input.current.click()}><UploadSimple size={20}/>{source?.example?'Upload your image':source?'Replace image':'Upload image'}</button><p>Drop or paste · JPG, PNG or WebP</p>{source&&<span>{source.width} × {source.height} px <button onClick={remove}>Remove</button></span>}</div>
      <fieldset className="dt-presets"><legend>Choose a look <span>{activePreset?'':'Custom'}</span></legend><div>{DITHER_PRESETS.map(item=><button key={item.id} aria-pressed={activePreset?.id===item.id} onClick={()=>preset(item)}><img src={`/assets/dither-examples/preset-${item.id}.jpg`} alt=""/><span>{item.name}{activePreset?.id===item.id&&<Check size={16}/>}</span></button>)}</div></fieldset>
      <label className="dt-field">Colour mode<select value={options.mode} disabled={options.algorithm==='floyd'} onChange={e=>update('mode',e.target.value)}><option value="bw">Black &amp; white</option><option value="colour">Keep image colours</option><option value="duotone">Custom two-tone</option></select></label>
      {options.algorithm==='floyd'&&<p className="dt-hint">Natural B&amp;W uses black and white. Try another look for colour.</p>}
      {options.mode==='duotone'&&<div className="dt-colours"><label>Dark colour<input type="color" value={options.dark} onInput={e=>update('dark',e.target.value)} onChange={e=>update('dark',e.target.value)}/></label><button aria-label="Swap dark and light colours" onClick={()=>{setOptions(p=>({...p,dark:p.light,light:p.dark}));setCancelled(false);}}><ArrowsLeftRight size={20}/></button><label>Light colour<input type="color" value={options.light} onInput={e=>update('light',e.target.value)} onChange={e=>update('light',e.target.value)}/></label></div>}
      <Slider label="Grain size" value={options.cell} min={1} max={12} suffix=" px" onChange={v=>update('cell',v)}/>
      <Slider label="Contrast" value={options.contrast} min={0} max={200} suffix="%" onChange={v=>update('contrast',v)}/>
      <details className="dt-advanced"><summary>Advanced settings</summary><div><label className="dt-field">Algorithm<select value={options.algorithm} onChange={e=>update('algorithm',e.target.value)}><option value="floyd">Floyd–Steinberg · black &amp; white</option><option value="bayer">Bayer · ordered pattern</option><option value="noise">Noise · scattered pattern</option></select></label>{options.algorithm==='bayer'&&<label className="dt-field">Bayer matrix<select value={options.matrix} onChange={e=>update('matrix',Number(e.target.value))}>{[2,4,8].map(v=><option key={v} value={v}>{v} × {v}</option>)}</select></label>}{options.mode==='colour'&&<Slider label="Levels per colour channel" value={options.levels} min={2} max={8} onChange={v=>update('levels',v)}/>}<Slider label="Brightness" value={options.brightness} min={0} max={200} suffix="%" onChange={v=>update('brightness',v)}/><label className="dt-check"><input type="checkbox" checked={options.invert} onChange={e=>update('invert',e.target.checked)}/>Invert tones</label><p className="dt-hint">Grain size is measured in output pixels. Reducing the output size changes the pattern density. Transparent areas become white.</p></div></details>
      <p className="dt-file-limits">Up to 32 MB · 24 MP · 12,000 px per side.<br/>Device capacity may be lower.</p>
      <button className="dt-mobile-preview underlined" onClick={()=>preview.current?.scrollIntoView({block:'start'})}>View your effect <ArrowRight size={17}/></button>
     </div>
    </section>
    <section className="dt-preview" ref={preview} aria-label="Image preview" aria-busy={busy}>
     <header className="dt-panel-heading"><div className="dt-view-switch" role="group" aria-label="Preview view"><button aria-pressed={view==='original'} onClick={()=>setView('original')}>Original</button><button aria-pressed={view==='effect'} onClick={()=>setView('effect')}>Dithered</button></div><div className="dt-preview-actions"><button disabled={!ready&&view==='effect'||!source} onClick={()=>inspect(true)}>100% detail</button><button aria-label="Expand image preview" disabled={!ready&&view==='effect'||!source} onClick={()=>inspect()}><CornersOut size={20}/></button></div></header>
     <div className="dt-preview-stage"><div className="dt-preview-note"><span>{source?.example?'EXAMPLE PREVIEW':source?'YOUR IMAGE':'IMAGE PREVIEW'}</span><span>{view==='original'?'Original':activePreset?.name||'Custom look'}</span></div>{shown?<img className={busy&&view==='effect'?'dt-updating':''} src={shown} alt={source.example?source.title+(view==='effect'?' with a dither effect':''):'Your selected image preview'}/>:<div className="dt-empty"><ImageSquare size={46}/><h3>Your next look starts here.</h3><p>Upload an image or choose an example below.</p></div>}{busy&&<div className="dt-processing" role="status"><span className="dt-spinner"/>{reading?'Opening image…':`Updating effect${rendered.progress?' · '+rendered.progress+'%':''}`}<button onClick={()=>{++sequence.current;setReading(false);setCancelled(true);setNotice('Processing cancelled. Your image and settings are kept.');}}>Cancel</button></div>}</div>
     <div className="dt-preview-caption"><p>{source?.example?'Example artwork · upload your own to try it.':'Your source stays unchanged. Changes update automatically.'}</p>{shownDimensions&&<span>{shownDimensions.width} × {shownDimensions.height} px{view==='effect'&&!ready?' · not ready':''}</span>}</div>
     <div className="dt-example-picker"><span>Try an example</span><div>{ditherExamples.map(item=><button key={item.id} onClick={()=>example(item)}><img src={ditherAsset(item.id)} alt=""/>{item.short}</button>)}</div></div>
    </section>
   </div>
   <footer className="dt-export"><label>Output size<select value={edge} onChange={e=>{setEdge(Number(e.target.value));setCancelled(false);setNotice('');}}><option value={0}>Keep original dimensions</option><option value={2048}>Up to 2048 px · long edge</option><option value={1024}>Up to 1024 px · long edge</option></select><span>{dimensions?`${dimensions.width} × ${dimensions.height} px · PNG`:'Choose an image to begin'}</span></label><div><button className="button secondary" disabled={!ready} onClick={download}><DownloadSimple size={19}/>Download PNG</button><button className="button" disabled={!ready} onClick={makePoster}>Make a poster <ArrowRight size={18}/></button></div></footer>
   {(fileError||rendered.error||cancelled||notice)&&<div className="dt-feedback" role={fileError||rendered.error?'alert':'status'}>{fileError||rendered.error||notice}{(rendered.error||cancelled)&&<button className="underlined" onClick={()=>{setCancelled(false);setRetry(v=>v+1);setNotice('');}}>Retry processing</button>}</div>}
  </section>
  {hasPoster&&<section id="dither-poster" className="dt-poster" hidden={!posterOpen} data-clarity-mask="true"><header><div><h2>Prepare your dithered poster</h2><p>The effect is already applied. Choose your paper and finished size.</p></div><button className="underlined" onClick={()=>{setPosterOpen(false);workbench.current?.scrollIntoView({block:'start'});}}><ArrowLeft size={17}/>Back to image effects</button></header><Editor ref={editor} pasteScope="dither-poster"/></section>}
  <section className="dt-content-section" id="dither-examples"><header><p className="dt-eyebrow">ONE PHOTO. A DIFFERENT CHARACTER.</p><h2>Find a look worth printing.</h2><p>Compare the actual local effects, then try the settings on your own image.</p></header><div className="dt-examples">{ditherExamples.map(item=><ExampleCard key={item.id} example={item} onTry={tryStyle}/>)}</div><p className="dt-source-note">Public-domain artworks from The Met Open Access. Examples are digital image effects, not photographs of physical prints.</p></section>
  <section className="dt-content-section"><header><p className="dt-eyebrow">FROM IMAGE TO ARTWORK</p><h2>Three steps. No prompt needed.</h2></header><div className="dt-three-steps">{[['01','Choose your image','Upload a JPG, PNG or WebP, or try a public-domain example. Your file stays in your browser.'],['02','Make it your own','Start with a look. Adjust the grain, contrast or colours, then inspect the result at 100%.'],['03','Download or make a poster','Save a PNG, or carry the effect straight into the poster maker to prepare printable sheets.']].map(([number,title,body])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
  <section className="dt-content-section dt-uses"><div><p className="dt-eyebrow">MADE FOR YOUR NEXT PROJECT</p><h2>Small pixels.<br/>Plenty of possibilities.</h2><p>Build an artistic texture for a wall print, a retro graphic or a black-and-white composition.</p></div><div>{[['Black-and-white art','Use fine grain to explore light and shadow in a portrait or photograph.'],['Retro graphics','Try an ordered pattern and two contrasting colours for a pixel-led design.'],['Printable wall posters','Take your finished image into the print editor. The pattern becomes larger as the physical poster size increases.']].map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></section>
  <section className="dt-content-section dt-faq"><header><p className="dt-eyebrow">A FEW USEFUL ANSWERS</p><h2>Image dithering, explained.</h2></header><div>{faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
  <section className="dt-content-section"><header><h2>Keep creating.</h2><p>Prepare your artwork and its print layout with the right tool.</p></header><div className="dt-related">{[['Make a poster','Split one image across printable sheets.','/'],['Halftone Poster Maker','Explore round dots and CMYK-style screens.','/tools/halftone-poster-maker'],['Image to PDF','Arrange separate images into one PDF.','/tools/image-to-pdf'],['AI Image Upscaler','Optional credit-based cloud enhancement.','/tools/ai-image-upscaler']].map(([title,body,url])=><a key={url} href={url}><h3>{title}<ArrowRight size={18}/></h3><p>{body}</p></a>)}</div></section>
  {lightbox&&<ImageLightbox images={lightbox.images} initialDetail={lightbox.detail} onClose={()=>setLightbox(null)}/>}
 </main>;
}
