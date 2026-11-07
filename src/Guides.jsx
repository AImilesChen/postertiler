import React,{useState} from 'react';
import {ArrowRight,ArrowLeft,Printer,Ruler,Scissors,ImageSquare,Crop,FilePdf,Files,BookOpen,CheckCircle,MagnifyingGlass,DownloadSimple,CaretDown} from '@phosphor-icons/react';
import {guides} from './data';
import {guideMeta,printProblems,printChecklist} from './guide-content';
import {guideHelp} from './guide-help';
import {searchGuides} from './guide-search';
import {DEFAULTS} from './geometry';
import {calibration,saveBlob} from './export';
import {trackEvent} from './analytics';
import ImageLightbox from './ImageLightbox';
import './guides.css';
const icons={poster:BookOpen,sheets:Files,ruler:Ruler,assembly:Scissors,quality:ImageSquare,margins:Crop,crop:Crop,paper:FilePdf};
const linkFor=slug=>'/guides/'+slug;
function GuideIcon({name,size=24}){const Icon=icons[name]||BookOpen;return <Icon size={size} aria-hidden="true"/>;}
export function PrintPreparation({compact=false}){
 const [paper,setPaper]=useState('A4'),[orientation,setOrientation]=useState('Portrait'),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function download(kind){
  setBusy(kind);setError('');setMessage('');
  try{
   const settings={...DEFAULTS,paper,orientation};
   if(kind==='calibration'){await calibration(settings);trackEvent('calibration_ready',{paper});}
   else{const {checklistPdf}=await import('./engine/pdf.ts');saveBlob(await checklistPdf(settings,printChecklist),'postertiler-print-checklist.pdf');}
   setMessage(`${paper} · ${orientation} PDF download requested. Print at Actual Size / 100%.`);
  }catch{setError('The PDF could not be prepared. Please try again.');}
  finally{setBusy('');}
 }
 return <section className={'gd-preparation '+(compact?'gd-preparation-compact':'')} aria-labelledby={compact?'article-preparation-title':'preparation-title'}>
  {!compact&&<div className="gd-calibration-image"><img src="/assets/guides/calibration-preview.webp" width="420" height="594" alt="Calibration PDF preview showing two 100 mm reference lines" loading="lazy"/><span>Actual calibration PDF preview</span></div>}
  <div className="gd-downloads"><p className="gd-eyebrow">BEFORE THE FULL PRINT</p><h2 id={compact?'article-preparation-title':'preparation-title'}>Check one sheet first.</h2><p>Download a calibration page and a simple print checklist. Choose paper your printer supports.</p>
   <fieldset disabled={!!busy}><legend className="gd-sr-only">Download paper settings</legend><div className="gd-paper-fields"><label>Paper size<select value={paper} onChange={e=>{setPaper(e.target.value);setMessage('');}}><option>A4</option><option>US Letter</option><option>A3</option></select></label><label>Orientation<select value={orientation} onChange={e=>{setOrientation(e.target.value);setMessage('');}}><option>Portrait</option><option>Landscape</option></select></label></div><div className="gd-download-actions"><button className="button" onClick={()=>download('calibration')}><DownloadSimple size={18}/>{busy==='calibration'?'Preparing…':'Calibration PDF'}</button><button className="button secondary" onClick={()=>download('checklist')}><FilePdf size={18}/>{busy==='checklist'?'Preparing…':'Print checklist'}</button></div></fieldset>
   <p className="gd-helper">Measure both reference lines on paper: each should be 100 mm. Download and print the PDF; screen previews are not print-scale templates.</p>{message&&<p className="gd-feedback" role="status">{message}</p>}{error&&<p className="gd-feedback gd-error" role="alert">{error}</p>}
  </div>
 </section>;
}
function GuideCard({guide}){
 const meta=guideMeta[guide.slug];
 return <a className="gd-guide-card" href={linkFor(guide.slug)}><div className="gd-card-top"><GuideIcon name={meta.icon}/><span>{guide.category}</span><ArrowRight size={20} aria-hidden="true"/></div><h3>{guide.title}</h3><p>{guide.intro}</p><span className="gd-card-bottom">{guide.steps.length} steps <span>Read guide <ArrowRight size={16}/></span></span></a>;
}
export function GuidesHub(){
 const [search,setSearch]=useState('');const clearSearch=()=>{setSearch('');document.getElementById('printing-guide-search')?.focus();};const filtered=searchGuides(guides,search,guideMeta),start=guides[0],hasSearch=!!search.trim();
 return <main className="guides-hub">
  <header className="gd-hero"><p className="gd-eyebrow"><Printer size={18}/>PRINTING HELP, STEP BY STEP</p><h1>Printing Guides</h1><p>Get the size right. Print your sheets.<br/>Put your poster together.</p><div className="gd-hero-actions"><a className="button" href={linkFor(start.slug)}>Make your first poster <ArrowRight size={18}/></a><a className="underlined" href="#printing-problems">Solve a printing problem <ArrowRight size={17}/></a></div></header>
  <section className="gd-start" aria-labelledby="gd-start-title"><div className="gd-start-copy"><p className="gd-eyebrow">START HERE</p><h2 id="gd-start-title">Your first poster,<br/>from image to wall.</h2><p>A complete walkthrough, from choosing an image to arranging the last sheet.</p><ol>{['Choose an image','Set paper & size','Check & download','Print & assemble'].map((s,i)=><li key={s}><span>{String(i+1).padStart(2,'0')}</span>{s}</li>)}</ol><a className="underlined" href={linkFor(start.slug)}>Read the getting-started guide <ArrowRight size={17}/></a></div><div className="gd-start-visual"><img src="/assets/homepage/step-size.webp" width="800" height="520" alt="PosterTiler controls beside a calculated two-by-two sheet layout"/><p>Plan your paper and finished size before printing.</p></div></section>
  <section className="gd-section" id="printing-problems" aria-labelledby="gd-problems-title"><header><p className="gd-eyebrow">FIND YOUR ANSWER</p><h2 id="gd-problems-title">What needs fixing?</h2><p>Go straight to the part that is holding up your print.</p></header><div className="gd-problems">{printProblems.map(item=><a key={item.slug} href={linkFor(item.slug)}><GuideIcon name={item.icon}/><div><h3>{item.title}</h3><p>{item.description}</p></div><ArrowRight size={20} aria-hidden="true"/></a>)}</div></section>
  <section className="gd-section" id="all-guides" aria-labelledby="gd-library-title"><header className="gd-library-heading"><div><p className="gd-eyebrow">THE GUIDE LIBRARY</p><h2 id="gd-library-title">A little help at every step.</h2><p>Browse all {guides.length} guides, or search for your question.</p></div><div className="gd-search"><label htmlFor="printing-guide-search">Find a printing guide</label><div><MagnifyingGlass size={19} aria-hidden="true"/><input id="printing-guide-search" type="search" placeholder="Try scale, margins or blurry" value={search} maxLength={160} onChange={e=>setSearch(e.target.value)} aria-describedby="gd-search-result"/>{hasSearch&&<button aria-label="Clear guide search" onClick={clearSearch}>Clear</button>}</div><p id="gd-search-result" role="status" aria-live="polite">{hasSearch?`${filtered.length} ${filtered.length===1?'guide matches':'guides match'} your search`:`${guides.length} practical guides`}</p></div></header>
   <div className="gd-guide-grid">{filtered.map(g=><GuideCard guide={g} key={g.slug}/>)}</div>{!filtered.length&&<div className="gd-no-results"><h3>No guides match that search.</h3><p>Try a shorter question, or browse all guides.</p><button className="button secondary" onClick={clearSearch}>Show all guides</button><a href="#printing-problems">Browse common printing problems</a></div>}
  </section>
  <div className="gd-section" id="print-preparation"><PrintPreparation/></div>
  <section className="gd-section gd-ready"><div><p className="gd-eyebrow">READY WHEN YOU ARE</p><h2>Take the next step.</h2><p>Use what you have learned in the free print tools.</p></div><div><a href="/#poster-editor"><strong>Make a poster</strong><span>Choose your image and print layout.</span><ArrowRight size={19}/></a><a href="/tools/poster-size-calculator"><strong>Calculate a poster size</strong><span>Compare dimensions and paper count.</span><ArrowRight size={19}/></a><a href="/tools/ai-image-upscaler"><strong>Explore AI enhancement</strong><span>Optional cloud processing with separate AI credits.</span><ArrowRight size={19}/></a></div></section>
 </main>;
}
export function GuideArticle({guide}){
 const meta=guideMeta[guide.slug],help=guideHelp[guide.slug];const [lightbox,setLightbox]=useState(null);
 const contents=<>{guide.steps.map(([title],i)=><a key={title} href={'#guide-step-'+i}>{String(i+1).padStart(2,'0')} {title}</a>)}<a href="#article-preparation-title">Print preparation</a><a href="#guide-questions">Common questions</a></>;
 return <main className="printing-article"><header className="gd-article-heading"><nav aria-label="Breadcrumb"><a href="/guides">Printing guides</a><span aria-hidden="true">/</span><span>{guide.category}</span></nav><h1>{guide.title}</h1><p>{guide.intro}</p><span className="gd-step-count">{guide.steps.length} practical steps</span></header>
  <div className="gd-reading-layout"><aside className="gd-desktop-contents"><strong>On this page</strong><nav aria-label="Article sections">{contents}</nav><a className="button" href={meta.tool[1]}>{meta.tool[0]} <ArrowRight size={17}/></a></aside>
   <article className="gd-article-body"><details className="gd-mobile-contents"><summary>On this page <CaretDown size={17}/></summary><nav aria-label="Mobile article sections">{contents}</nav></details>
    <div className="gd-takeaway"><CheckCircle size={23} aria-hidden="true"/><p>{meta.takeaway}</p></div>
    {guide.steps.map(([title,body],i)=><section className="gd-article-step" id={'guide-step-'+i} key={title}><p className="gd-eyebrow">STEP {String(i+1).padStart(2,'0')}</p><h2>{title}</h2><p>{body}</p>{meta.details?.[i]&&<p>{meta.details[i]}</p>}{meta.visual?.step===i&&<figure className="gd-figure"><button onClick={()=>setLightbox([{url:meta.visual.src,label:title}])} aria-label={'Enlarge illustration: '+title}><img src={meta.visual.src} alt={meta.visual.alt} loading="lazy"/><span>View larger <ArrowRight size={15}/></span></button><figcaption>{meta.visual.caption}</figcaption></figure>}</section>)}
    {guide.slug==='image-resolution-for-large-posters'&&<div className="gd-tool-callout"><GuideIcon name="quality"/><div><h3>Need a larger pixel image?</h3><p>Compare an optional AI-enhanced result before using it in your poster. AI tasks use separate credits; local poster PDFs remain free.</p><a className="underlined" href="/tools/ai-image-upscaler">Explore AI Image Upscaler <ArrowRight size={17}/></a></div></div>}
    <PrintPreparation compact/>
    <section className="gd-article-section"><h2>Common mistakes</h2><ul>{help.mistakes.map(text=><li key={text}>{text}</li>)}</ul></section>
    <section className="gd-article-section" id="guide-questions"><h2>Frequently asked questions</h2>{help.faq.map(([q,a])=><details className="gd-question" key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
    <section className="gd-article-section gd-related-guides"><p className="gd-eyebrow">KEEP GOING</p><h2>Your next useful read.</h2>{meta.related.map(slug=>{const next=guides.find(g=>g.slug===slug);return <a key={slug} href={linkFor(slug)}><span>{next.title}</span><ArrowRight size={18}/></a>;})}<div className="gd-article-actions"><a className="underlined" href="/guides"><ArrowLeft size={17}/>All printing guides</a><a className="button" href={meta.tool[1]}>{meta.tool[0]} <ArrowRight size={17}/></a></div></section>
   </article>
  </div>{lightbox&&<ImageLightbox images={lightbox} onClose={()=>setLightbox(null)}/>}
 </main>;
}
