import React, { useId, useRef, useState } from 'react';
import { ArrowRight, Printer, LockSimple, FilePdf, GridFour, Ruler, Files, User, CirclesFour, Check, Plus } from '@phosphor-icons/react';
import Editor from './Editor';
import { samples, guides, imagePath } from './data';
import { DEFAULTS, geometry, sizeText } from './geometry';
import { sampleSettings } from './example-links';
import { lifeSettings } from './engine/creative.ts';
import { previewPlan } from './engine/preview.ts';
import { calibration } from './export';
import { trackEvent } from './analytics';
import copy from './homepage-copy.json';
import { featuredPosters, posterScenarios } from './homepage-artwork';
import UpscaleShowcase from './UpscaleShowcase';
import './homepage.css';

const block = id => copy.blocks.find(b => b.id === id)?.copy || {};
const arrow = <ArrowRight size={17} aria-hidden="true" />;
const asset = name => `/assets/homepage/${name}`;
const sample = id => samples.find(s => s.id === id);

function Scene({ id, alt, artwork = false }) {
  const prefix=artwork?'art':'scene',item=sample(id);
  return <picture><source type="image/webp" srcSet={`${asset(`${prefix}-${id}-480.webp`)} 480w, ${asset(`${prefix}-${id}-960.webp`)} 960w`} sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw" /><img src={asset(`${prefix}-${id}.jpg`)} width="960" height={artwork?Math.round(item.height*960/item.width):640} alt={alt} loading="lazy" decoding="async" /></picture>;
}

export function SheetDiagram({ settings, pixels, title }) {
  const id = useId().replace(/:/g, ''), g = geometry(settings);
  const plan = previewPlan(g, pixels, settings.placement), b = plan.paperBounds;
  const pad = Math.max(b.width, b.height) * .07;
  return <svg className="hp-sheet-map" viewBox={`${b.x-pad} ${b.y-pad} ${b.width+pad*2} ${b.height+pad*2}`} role="img" aria-label={`${title}: ${g.columns} columns, ${g.rows} rows; ${g.count} sheets. Finished size ${sizeText(g,'cm')}. White is paper margin; blue is image area; hatched strips overlap.`}>
    <defs><pattern id={`${id}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#b6ccdf"/><path d="M0 8L8 0" stroke="#698aa5" strokeWidth="1"/></pattern></defs>
    {plan.pages.map(p=><rect key={`paper-${p.label}`} {...p.paper} fill="#fff" stroke="#8a9ba9" strokeWidth="1"/>)}
    {plan.pages.map(p=>p.image&&<rect key={`image-${p.label}`} {...p.image} fill="#d4e3ef"/>)}
    {plan.overlaps.map((r,i)=><rect key={i} {...r} fill={`url(#${id}-hatch)`}/>)}
    {plan.pages.map(p=><g key={p.label}><rect x={p.x} y={p.y} width={p.width} height={p.height} fill="none" stroke="#69849a" strokeWidth="1"/><text x={p.x+6} y={p.y+18} fontSize="13" fill="#24445c">{p.label}</text></g>)}
    <rect width={g.width} height={g.height} fill="none" stroke="#1c4059" strokeWidth="2"/>
  </svg>;
}

function CaseCard({ id, title, style, onTry, life = false }) {
  const [layout,setLayout] = useState(false), item=sample(id);
  const settings=life?lifeSettings(1800,item):sampleSettings(item), g=geometry(settings);
  return <article className="hp-case">
    <div className="hp-case-views" role="group" aria-label={`${title} view`}><button aria-pressed={!layout} onClick={()=>setLayout(false)}>Finished view</button><button aria-pressed={layout} onClick={()=>setLayout(true)}>Sheet layout</button></div>
    <div className="hp-case-art">{layout?<><SheetDiagram settings={settings} pixels={item} title={title}/><span className="hp-map-key">White: sheet · Blue: image · Hatching: overlap</span></>:<><Scene id={id} alt={`${title} shown as an assembled paper poster in a room`}/><span className="hp-mockup-label">Illustrative mockup</span></>}</div>
    <p className="hp-art-style">{style}</p><h3>{title}</h3><p className="hp-case-size">{sizeText(g,'cm')} <span>· {g.count} A4 sheets</span></p><p className="hp-case-detail">{life?'180 cm whole-image height; background retained.':'5 mm margins · 10 mm overlap · Fit whole image.'}</p>
    {life?<a className="underlined hp-action" href={`/tools/life-size-poster-maker?sample=${id}`}>Open Life Size Poster Maker {arrow}</a>:<button className="underlined hp-action" onClick={()=>onTry(id)}>Try this poster {arrow}</button>}
  </article>;
}

const looks=[
  ['original','Original','Keep the colours and details of your source image.'],
  ['dots','Halftone dots','Turn tones into a bold black-and-white dot screen.'],
  ['dither','Black-and-white dither','Build light and shade from tiny black and white pixels.'],
  ['cmyk','CMYK-style screen','Layer four coloured screens for a print-inspired look.'],
];
const tools=[
  [GridFour,'Block Poster Maker','Split one image across printable sheets.','#poster-editor'],
  [Ruler,'Poster Size Calculator','Plan finished dimensions and paper count.','/tools/poster-size-calculator'],
  [Files,'Image to PDF','Arrange multiple images in one PDF.','/tools/image-to-pdf'],
  [FilePdf,'PDF Poster Printer','Tile a page from an existing PDF.','/tools/pdf-poster-printer'],
  [User,'Life Size Poster Maker','Set the physical height of your subject.','/tools/life-size-poster-maker'],
  [CirclesFour,'Halftone Poster Maker','Explore dots, dithering and colour screens.','/tools/halftone-poster-maker'],
];

export default function Homepage() {
  const editor=useRef(), [calibrationError,setCalibrationError]=useState('');
  const trySample=id=>{editor.current?.useExample(id);document.getElementById('poster-editor')?.scrollIntoView({block:'start'});};
  const tryLook=id=>{editor.current?.useLook(id);document.getElementById('poster-editor')?.scrollIntoView({block:'start'});};
  const downloadCalibration=async()=>{
    setCalibrationError('');
    try{await calibration(editor.current?.getSettings()||DEFAULTS);trackEvent('calibration_ready');}
    catch{setCalibrationError('Check your paper and margin settings in the editor, then try again.');}
  };
  const benefits={print:Printer,local:LockSimple,free:FilePdf};
  return <div className="homepage-expanded"><div className="hero"><h1>{block('hero').heading}</h1><p>{block('hero').subheading}</p><ul className="hero-benefits" aria-label="Free poster maker benefits">{block('hero').features.map(({id,title,description})=>{const Icon=benefits[id];return <li key={id}><Icon size={21} aria-hidden="true"/><span><strong>{title}</strong><small>{description}</small></span></li>;})}</ul></div>
    <main><Editor ref={editor} homepage/>
      <section className="hp-section" id="how-it-works"><header className="hp-heading"><small>FROM IMAGE TO WALL</small><h2>From one image to a poster on your wall</h2><p>A few settings, ordinary printer paper and a clear plan for putting it together.</p></header>
        <div className="hp-steps">{[
          ['Choose your image','Upload a JPG, PNG or WebP, paste an image, or start with one of our examples.','step-upload.webp','Actual PosterTiler upload controls with the Alpine reflections example selected'],
          ['Set the finished size','Choose your paper and poster dimensions. Review the size and sheets before exporting.','step-size.webp','Actual paper and poster-size controls for the four-sheet Alpine example'],
          ['Download, print and assemble','Download the PDF, print at Actual Size / 100%, trim the joining edges and align the overlap.','step-print.webp','Actual exported Alpine poster pages and assembly map'],
        ].map(([title,body,img,alt],i)=><article key={title}><img className="hp-step-image" src={asset(img)} width="800" height="520" alt={alt} loading="lazy"/><div className="hp-step-heading"><span>0{i+1}</span><h3>{title}</h3></div><p>{body}</p></article>)}</div><button className="underlined hp-section-link" onClick={()=>trySample('alpine')}>Try an example {arrow}</button>
      </section>

      <UpscaleShowcase/>
      <section className="hp-section" id="poster-examples"><header className="hp-heading hp-heading-split"><div><small>THE BIGGER PICTURE</small><h2>See what your poster can become</h2><p>Explore three starting points, then check how they fit onto real sheets.</p></div><a className="underlined" href="/gallery">Browse the gallery {arrow}</a></header><div className="hp-cases">{featuredPosters.map(item=><CaseCard key={item.id} {...item} onTry={trySample}/>)}</div><p className="hp-footnote">Room images are illustrative mockups. Sheet layouts and dimensions are calculated by the print engine; mockup scale is approximate.</p></section>

      <section className="hp-section" id="poster-uses"><header className="hp-heading"><small>MADE FOR YOUR IDEAS</small><h2>One tool. Plenty of ways to use it.</h2><p>Start with a use in mind. Bring your own artwork or try a sample.</p></header><div className="hp-scenarios">{posterScenarios.map(({id,title,body,life})=><article key={id}><div className={`hp-scene hp-artwork-preview ${sample(id).width<sample(id).height?'hp-artwork-portrait':''}`}>{life?<a href={`/tools/life-size-poster-maker?sample=${id}`} aria-label="Try life-size poster example"><Scene id={id} artwork alt={sample(id).title}/></a>:<button className="hp-scene-button" aria-label={`Try ${title.toLowerCase()} example`} onClick={()=>trySample(id)}><Scene id={id} artwork alt={sample(id).title}/></button>}</div><p className="hp-art-style">{sample(id).style}</p><h3>{title}</h3><p>{body}</p>{life?<a className="underlined" href={`/tools/life-size-poster-maker?sample=${id}`}>Try life-size {arrow}</a>:<button className="underlined" onClick={()=>trySample(id)}>Try this idea {arrow}</button>}</article>)}</div><p className="hp-footnote">Original sample illustrations; the world map is fictional. Working from a PDF plan? <a href="/tools/pdf-poster-printer">Open PDF Poster Printer</a>.</p></section>

      <section className="hp-section" id="poster-styles"><header className="hp-heading"><small>EXPLORE A DIFFERENT LOOK</small><h2>One image. Four different looks.</h2><p>Try a look on your own image in the editor above, or start with the example.</p></header><div className="hp-looks">{looks.map(([id,title,body])=><article key={id}><img src={asset(`look-${id}-800.webp`)} srcSet={`${asset(`look-${id}-400.webp`)} 400w, ${asset(`look-${id}-800.webp`)} 800w`} sizes="(max-width: 900px) 50vw, 25vw" width="800" height="1157" loading="lazy" alt={`${title} rendering of Colour and form artwork`}/><h3>{title}</h3><p>{body}</p><button className="underlined" aria-label={`Try ${title} look`} onClick={()=>tryLook(id)}>Try this look {arrow}</button></article>)}</div><p className="hp-footnote">CMYK-style is an RGB artwork effect, not prepress colour separation. Effects do not add image detail or use AI.</p></section>

      <section className="hp-section hp-band" id="free-tools"><header className="hp-heading hp-heading-split"><div><small>SIX FREE LOCAL TOOLS</small><h2>More ways to prepare your print</h2><p>Choose the tool that fits your source. Your files are processed in your browser.</p></div><a className="underlined" href="/tools">All tools {arrow}</a></header><div className="hp-tools">{tools.map(([Icon,title,body,url])=><a href={url} key={title}><Icon size={28} weight="regular" aria-hidden="true"/><h3>{title}</h3><p>{body}</p>{arrow}</a>)}</div></section>

      <section className="hp-section" id="print-and-assemble"><header className="hp-heading"><small>PRINT WITH A CLEAR PLAN</small><h2>Plan the size. Get the joins right.</h2><p>Printer margins, overlap and panel gaps do different jobs.</p></header><div className="hp-print-diagrams">{[
        ['margins','Printer margins','White paper around the printable area. Trim or cover the joining margins when assembling a continuous poster.'],
        ['overlap','Overlap','A repeated image strip on neighbouring sheets. Overlay it to align the artwork; it does not add a white gap.'],
        ['gaps','Framed Grid gaps','Space deliberately left between trimmed panels. These decorative gaps count toward the finished dimensions.'],
      ].map(([id,title,body])=><article key={id}><img src={asset(`print-${id}.svg`)} width="600" height="360" alt={`${title}: geometry-derived diagram with labelled dimensions` } loading="lazy"/><h3>{title}</h3><p>{body}</p></article>)}</div>
        <div className="hp-print-actions"><article><Ruler size={28} aria-hidden="true"/><h3>Know the size before you print</h3><p>Choose a sheet layout or an exact finished size. The calculator accounts for paper, margins, overlap and gaps.</p><a className="button secondary" href="/tools/poster-size-calculator">Open size calculator {arrow}</a><a className="underlined" href="/guides/how-to-assemble-a-tiled-poster">Read the assembly guide {arrow}</a></article><article className="hp-calibration"><img src={asset('calibration-thumb.webp')} width="300" height="424" alt="Actual A4 calibration PDF with its 100 mm measurement line" loading="lazy"/><div><h3>Print at Actual Size / 100%</h3><p>Turn off Fit to page. Print a calibration page and measure the 100 mm line before printing the full poster.</p><button className="underlined" onClick={downloadCalibration}>Download calibration page {arrow}</button><small>Uses the editor’s current paper and margins. Before editing: default A4, 5 mm margins.</small>{calibrationError&&<p role="alert">{calibrationError}</p>}</div></article></div>
      </section>

      <section className="hp-section hp-band" id="local-or-cloud"><header className="hp-heading"><small>YOUR CHOICE OF PROCESSING</small><h2>Choose where your PDF is prepared</h2><p>Start free in your browser. Use optional cloud processing when a supported job needs more room.</p></header><div className="hp-processing"><article><div className="hp-plan-top"><LockSimple size={27} aria-hidden="true"/><span>NO ACCOUNT NEEDED</span></div><h3>Free local PDF</h3><p className="hp-plan-price">$0 <small>Always free for basic exports</small></p><p>For everyday image posters your device can prepare.</p><ul>{['Images stay in your browser','Up to 100 poster sheets','JPG, PNG and WebP within local limits','No watermark. No sign-up.'].map(s=><li key={s}><Check size={16} aria-hidden="true"/>{s}</li>)}</ul><a className="button" href="#poster-editor">Make a free poster {arrow}</a></article><article><div className="hp-plan-top"><FilePdf size={27} aria-hidden="true"/><span>OPTIONAL · STRIPE SANDBOX</span></div><h3>Cloud PDF</h3><p className="hp-plan-price">$1.99 <small>/ 1 export · $5.99 / 5 exports</small></p><p>For supported high-pixel JPGs, more sheets or work your device cannot finish.</p><ul>{['Uploads only after your separate agreement','Up to 400 poster sheets','One credit used for a successful PDF','Failure or cancellation releases the reservation'].map(s=><li key={s}><Check size={16} aria-hidden="true"/>{s}</li>)}</ul><a className="button secondary" href="/pricing">View cloud options {arrow}</a><a className="underlined" href="/cloud">Open Cloud PDF {arrow}</a></article></div><div className="hp-cloud-note"><strong>Test mode: no real money is charged.</strong><p>Cloud processing does not sharpen your image. Limits differ by format: JPG up to 20 MiB / 100 MP; PNG up to 8 MiB / 4 MP (8-bit, non-interlaced). WebP and PDF are not supported in this cloud release. Local limits are 32 MiB / 24 MP. <a href="/pricing">Compare full file limits and pricing</a>. Re-download the same available cloud result without another credit.</p></div></section>

      <section className="hp-section" id="printing-guides"><header className="hp-heading hp-heading-split"><div><small>PRINTING GUIDES</small><h2>Help from the first sheet to the last join</h2><p>Practical answers for paper, print scale and assembly.</p></div><a className="underlined" href="/guides">All printing guides {arrow}</a></header><div className="hp-guides">{guides.slice(1,4).map((g,i)=><a href={`/guides/${g.slug}`} key={g.slug}><small>0{i+1} · {g.category}</small><h3>{g.title}</h3><p>{g.intro}</p>{arrow}</a>)}</div><div className="hp-extra-guides">{[guides[0],guides[4]].map(g=><a className="underlined" href={`/guides/${g.slug}`} key={g.slug}>{g.title} {arrow}</a>)}</div></section>

      <section className="hp-section hp-faq" id="faq"><header className="hp-heading"><small>FAQ</small><h2>{block('faq').heading}</h2><p>A few things to know before you print.</p></header><div>{block('faq').items.map(f=><details key={f.question}><summary>{f.question}<Plus size={18} aria-hidden="true"/></summary><p>{f.answer} {f.target&&<a href={f.target}>{f.linkLabel}</a>}</p></details>)}</div></section>
      <section className="hp-section hp-final"><small>MAKE SOMETHING BIGGER</small><h2>Ready to make your poster?</h2><p>Start with a favourite image. We’ll help you plan the pages.</p><div><a className="button" href="#poster-editor">Make my poster {arrow}</a><a className="underlined" href="/gallery">Browse examples {arrow}</a></div><small>Free local PDF · No watermark · No sign-up</small></section>
    </main></div>;
}
