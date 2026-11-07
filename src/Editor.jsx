import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowSquareOut, CaretDown, CaretUp, UploadSimple, X, ArrowCounterClockwise, LockSimple, Sparkle } from '@phosphor-icons/react';
import { B, Field, NumberInput, Alert } from './ui';
import Preview from './Preview';
import { DEFAULTS, geometry, sizeText, MM_PER_UNIT, sanitizeSettings } from './geometry';
import { samples, imagePath } from './data';
import { loadImage, inspectFile, makePoster, saveBlob, calibration, assembly } from './export';
import { trackEvent } from './analytics';
import { sampleSettings } from './example-links';
import ImageAdjustments from './ImageAdjustments';
import useAdjustedImage from './useAdjustedImage';
import AiTools from './AiTools';
import AiImagePreview from './AiImagePreview';
import { PROCESSED_IMAGE_BYTES } from './engine/image.ts';
import { TREATMENT_DEFAULTS, IMAGE_LOOKS, lookFromQuery } from './engine/image-adjustments.ts';
const icon = { size: 18, 'aria-hidden': true };
export default forwardRef(function Editor({ calculator = false, homepage = false }, ref) {
  const [source, setSource] = useState(null), [fileName, setFileName] = useState('');
  const [pixels, setPixels] = useState({ width: 1043, height: 1508 });
  const [step, setStep] = useState(1), [settings, setSettings] = useState({ ...DEFAULTS, locked: !calculator });
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [progress, setProgress] = useState('');
  const [reset, setReset] = useState(false), [pdf, setPdf] = useState(null);
  const [treatment,setTreatment] = useState({...TREATMENT_DEFAULTS}),[adjustmentTab,setAdjustmentTab] = useState('basic');
  const [aiImage,setAiImage]=useState(null),[sourceIsAi,setSourceIsAi]=useState(false);
  const [aiPreview,setAiPreview]=useState(null);
  const pendingUpscale=useRef(false);
  const aiActive=aiImage?.baseSource===source&&!!source;
  const displayPixels=aiActive?aiImage:pixels;
  const adjusted = useAdjustedImage(aiActive?aiImage.url:source,treatment), pendingLook = useRef(null);
  useEffect(()=>()=>{if(aiImage?.url)URL.revokeObjectURL(aiImage.url);},[aiImage]);
  useEffect(()=>{setAiImage(null);},[source]);
  const input = useRef(), cancel = useRef({ current: false }), readId = useRef(0), sourceRef = useRef(null);
  const sourceKind = useRef(null);
  const [replacement, setReplacement] = useState(null);
  const [demoFailed,setDemoFailed] = useState(false);
  const demo = homepage && !source && !calculator && !demoFailed;
  const demoSample = samples[0];
  useImperativeHandle(ref, () => ({
    useExample: id => { const sample = samples.find(s => s.id === id); if (sample) requestSample(sample, 3); },
    useLook: look => {
      if (!IMAGE_LOOKS.includes(look)) return;
      setAdjustmentTab('effects');
      if (status==='reading') { pendingLook.current=look; return; }
      if (sourceRef.current) {
        invalidate();setTreatment(current=>({...current,effect:look,invert:false}));setStep('adjustments');focusEditor();
      } else chooseSample(samples.find(s=>s.id==='geometry'),'adjustments',true,look);
    },
    getSettings: () => ({ ...settings }),
    useAiImage: async blob => {
      const id=++readId.current;invalidate();setStatus('reading');let url;
      try{await inspectFile(blob,PROCESSED_IMAGE_BYTES);url=URL.createObjectURL(blob);const image=await loadImage(url);if(id!==readId.current){URL.revokeObjectURL(url);return;}setImage(url,'AI artwork.png',image);setSourceIsAi(true);sourceKind.current='user';setStep('adjustments');setStatus('');}
      catch{if(url)URL.revokeObjectURL(url);if(id===readId.current){setStatus('');setError('The AI image could not be opened. Your previous image is still here.');}}
    },
  }));
  const g = geometry(settings), busy = status === 'exporting';
  const cloudLink = <a href="/cloud" onClick={()=>{try{sessionStorage.setItem('postertiler-cloud-settings',JSON.stringify(settings));}catch{}}}>Try optional cloud processing</a>;
  const alternativeOrientation = g.pw > g.ph ? 'Portrait' : 'Landscape';
  const alternative = geometry({ ...settings, mode: 'exact', width: g.width, height: g.height, orientation: alternativeOrientation });
  const invalidate = () => { cancel.current.current = true; cancel.current = { current: false }; setPdf(null); setStatus(''); setError(''); };
  const change = fn => { invalidate(); setSettings(fn); };
  const editImage = value => { invalidate();setTreatment(value); };
  const focusEditor = () => requestAnimationFrame(() => {
    const editor = document.getElementById('poster-editor');
    editor?.querySelector('.step.active .step-heading')?.focus({preventScroll:true});
    if (homepage) editor?.scrollIntoView({block:'start'});
  });
  const openUpscaler = () => { setError(''); if(!source){pendingUpscale.current=true;input.current?.click();}else{setStep('upscale');focusEditor();} };
  const update = (key, value) => change(s => ({ ...s, [key]: value }));
  const setImage = (url, name, image, look = 'original') => {
    if (sourceRef.current?.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current);
    sourceRef.current = url; setSource(url); setFileName(name);setSourceIsAi(false);
    const selectedLook=pendingLook.current||look;pendingLook.current=null;
    setTreatment({...TREATMENT_DEFAULTS,effect:selectedLook});
    setAdjustmentTab(selectedLook==='original'?'basic':'effects');
    setPixels({ width: image.naturalWidth, height: image.naturalHeight });
    setSettings(s => ({ ...s, imageRatio: image.naturalWidth / image.naturalHeight,
      ...(s.mode === 'exact' && s.locked ? { height: s.width * image.naturalHeight / image.naturalWidth } : {}) }));
  };
  const chooseSample = async (sample, targetStep = 'adjustments', preset = true, look = 'original') => {
    const id = ++readId.current; invalidate(); setStatus('reading');
    try {
      const url = imagePath(sample.image), image = await loadImage(url);
      if (id !== readId.current) return;
      setImage(url, sample.image, image, look); sourceKind.current = 'sample';
      setSettings(s => preset ? sampleSettings(sample) : ({ ...s, columns: sample.columns, rows: sample.rows, imageRatio: image.naturalWidth / image.naturalHeight }));
      setStep(targetStep); setStatus(''); trackEvent('poster_start');
      focusEditor();
    } catch { if (id === readId.current) { setError('This example could not be loaded. Try again or choose your own image.'); setStatus(''); } }
  };
  const requestSample = (sample, targetStep = 'adjustments') => {
    if (sourceKind.current === 'user') setReplacement({ sample, targetStep });
    else chooseSample(sample, targetStep);
  };
  const read = async files => {
    if (files.length !== 1) { setError('Choose one image to make a poster.'); return; }
    const id = ++readId.current; invalidate(); setStatus('reading');
    let url;
    try {
      await inspectFile(files[0]); url = URL.createObjectURL(files[0]); const image = await loadImage(url);
      if (id !== readId.current) { URL.revokeObjectURL(url); return; }
      setImage(url, files[0].name, image); sourceKind.current = 'user'; setStep(pendingUpscale.current?'upscale':'adjustments'); pendingUpscale.current=false; setStatus(''); trackEvent('poster_start');focusEditor();
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      if (id === readId.current) { pendingLook.current=null;setError(e.message || 'We could not read this image. Try another file.'); setStatus(''); }
    }
  };
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    try { if (query.has('settings')) setSettings(sanitizeSettings(JSON.parse(query.get('settings')))); } catch { setError('Those shared settings could not be read. The defaults are ready to use.'); }
    const look=lookFromQuery(location.search);
    const sample = samples.find(s => s.id === query.get('sample')) || (look?samples.find(s=>s.id==='geometry'):null);
    if (sample && !calculator) chooseSample(sample,look?'adjustments':Math.min(5,Math.max(1,Number(query.get('step'))||3)),!query.has('settings'),look||'original');
    return () => { ++readId.current; cancel.current.current = true; if (sourceRef.current?.startsWith('blob:')) URL.revokeObjectURL(sourceRef.current); };
  }, []);
  useEffect(() => {
    if (calculator) return;
    const paste = e => { const files = Array.from(e.clipboardData?.files || []); if (files.length) { e.preventDefault(); read(files); } };
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste);
  });
  const next = () => {
    if (!source && !calculator) { setError('Choose an image to continue.'); return; }
    if (g.error) { setError(g.error); return; }
    setError(''); if (step === 4) trackEvent('settings_complete', { paper: settings.paper, sheet_count: g.count }); setStep(step===1?'adjustments':Math.min(5, step + 1));
  };
  const download = async () => {
    if (g.error || !source) { setError(g.error || 'Choose an image to continue.'); return; }
    if (!adjusted.ready || status==='reading') { setError('Wait for the image preview to finish, retry the update or restore the original image.'); return; }
    const token = { current: false }; cancel.current = token;
    setStatus('exporting'); setError(''); setPdf(null); setProgress('Reading image and preparing PDF…');
    try {
      const bytes = await makePoster(adjusted.url, settings, (p, total) => setProgress(total ? `Preparing page ${p} of ${total}` : 'Preparing the image…'), token, adjusted.edited||aiActive||sourceIsAi);
      if (cancel.current !== token) return;
      setPdf(bytes); saveBlob(bytes, 'postertiler-poster.pdf'); setStatus('ready'); trackEvent('pdf_ready', { paper: settings.paper, sheet_count: g.count });
    } catch (e) {
      if (cancel.current !== token) return;
      const canceled = token.current || e.message === 'canceled'; setStatus(canceled ? 'canceled' : 'failed');
      if (!canceled) setError(e.message); trackEvent(canceled ? 'pdf_canceled' : 'pdf_failed');
    }
  };
  const auxiliary = async kind => {
    if (g.error) { setError(g.error); return; }
    try { await (kind === 'calibration' ? calibration(settings) : assembly(settings)); trackEvent(kind === 'calibration' ? 'calibration_ready' : 'assembly_ready'); }
    catch { setError('This guide could not be prepared. Check the settings and try again.'); }
  };
  const paperControls = <>
    <div className="field-pair"><Field label="Paper size"><select value={settings.paper} onChange={e => update('paper', e.target.value)}><option>A4</option><option>US Letter</option><option>A3</option></select></Field><Field label="Orientation"><select value={settings.orientation} onChange={e => update('orientation', e.target.value)}><option>Automatic</option><option>Portrait</option><option>Landscape</option></select></Field></div>
    <Field label="Units"><select value={settings.unit} onChange={e => update('unit', e.target.value)}>{Object.keys(MM_PER_UNIT).map(u => <option key={u}>{u}</option>)}</select></Field>
    <NumberInput label="Printer margins" value={settings.margin} onChange={v => update('margin', v)} unit="mm" />
    <label className="check"><input type="checkbox" checked={!!settings.separateMargins} onChange={e => update('separateMargins', e.target.checked)} />Set margins separately</label>
    {settings.separateMargins && <div className="field-pair">{['Top', 'Right', 'Bottom', 'Left'].map(side => <NumberInput key={side} label={`${side} margin`} value={settings[`margin${side}`] ?? settings.margin} unit="mm" onChange={v => update(`margin${side}`, v)} />)}</div>}
    <small>White space on each edge of every sheet, not a gap in the finished poster. Trim or cover these margins during assembly. Check the minimum margins your printer supports.</small>
  </>;
  const sizeControls = <>
    <Field label="Set size by"><div className="segmented"><button aria-pressed={settings.mode === 'sheets'} onClick={() => change(s => ({ ...s, mode: 'sheets', columns: g.error ? 2 : g.columns, rows: g.error ? 2 : g.rows }))}>Sheets</button><button disabled={settings.layoutMode === 'framed'} aria-pressed={settings.mode === 'exact'} onClick={() => change(s => {
      const width = g.error ? 390 : g.width;
      return { ...s, mode: 'exact', width, height: s.locked && source ? width * displayPixels.height / displayPixels.width : g.error ? 564 : g.height };
    })}>Exact size</button></div></Field>
    <div className="field-pair">{settings.mode === 'sheets' ? <><NumberInput label="Sheets across" value={settings.columns} min={1} onChange={v => update('columns', v)} /><NumberInput label="Sheets down" value={settings.rows} min={1} onChange={v => update('rows', v)} /></> : ['width', 'height'].map(key => <NumberInput key={key} label={key === 'width' ? 'Width' : 'Height'} value={settings[key] === '' ? '' : Number((settings[key] / MM_PER_UNIT[settings.unit]).toFixed(3))} unit={settings.unit} step={settings.unit === 'mm' ? 1 : .1} onChange={value => change(s => {
      const mm = value === '' ? '' : value * MM_PER_UNIT[s.unit];
      const ratio = source ? displayPixels.width / displayPixels.height : s.width / s.height;
      return { ...s, [key]: mm, ...(s.locked && mm !== '' && ratio > 0 ? key === 'width' ? { height: mm / ratio } : { width: mm * ratio } : {}) };
    })} />)}</div>
    {settings.mode === 'exact' && <label className="check"><input type="checkbox" checked={settings.locked} onChange={e => {
      const locked = e.target.checked;
      change(s => ({ ...s, locked, ...(locked && source ? { height: s.width * displayPixels.height / displayPixels.width } : {}) }));
    }} /><LockSimple {...icon} />Lock aspect ratio</label>}
    <div className="control-group"><span>Image fit</span>{[['fit', 'Fit whole image'], ['fill', 'Fill and crop']].map(([value, label]) => <label className="radio" key={value}><input type="radio" name={calculator ? 'calculator-fit' : 'image-fit'} checked={settings.placement === value} onChange={() => update('placement', value)} />{label}</label>)}<small>{settings.placement === 'fit' ? 'Keeps the full image. Blank areas may appear.' : 'Fills the poster. Image edges may be cropped in the preview.'}</small></div>
    <dl className="metrics"><dt>Finished size</dt><dd>{!g.error && sizeText(g, settings.unit)}</dd><dt>Total sheets</dt><dd>{!g.error && `${g.count} ${settings.paper} sheets`}</dd></dl>
    <small>Based on {settings.separateMargins ? 'your four printer margins' : `${settings.margin} mm margins`} and {g.framed ? `${g.gap} mm panel gaps` : `${settings.overlap} mm overlap`}.{settings.labels && ' Includes a separate 5 mm label band on each sheet.'}</small>
  </>;
  const printControls = <>
    <Field label="Poster layout"><select value={settings.layoutMode || 'continuous'} onChange={e => {
      const layoutMode = e.target.value;
      change(s => ({ ...s, layoutMode, ...(layoutMode === 'framed' ? { mode: 'sheets', columns: g.error ? 2 : g.columns, rows: g.error ? 2 : g.rows } : {}) }));
    }}><option value="continuous">Continuous poster</option><option value="framed">Framed Grid</option></select></Field>
    {g.framed ? <><NumberInput label="Panel gap" value={settings.gap} onChange={v => update('gap', v)} unit="mm" /><small>Framed Grid uses sheet counts. Trim each panel and mount with this gap. Image strips in the gaps are omitted, and finished dimensions include the spacing.</small></> : <>
    <NumberInput label="Overlap" value={settings.overlap} onChange={v => update('overlap', v)} unit="mm" />
    <small>{Number(settings.overlap) === 0 ? 'Trim and join the edges directly; tape the back.' : 'Repeat part of the image on neighboring sheets to help line them up.'}</small>
    </>}<label className="check"><input type="checkbox" checked={settings.cutGuides} onChange={e => update('cutGuides', e.target.checked)} />Cut guides</label>
    <label className="check"><input type="checkbox" checked={settings.labels} onChange={e => update('labels', e.target.checked)} />Printed page labels</label>
    <small>Printed labels reserve a removable 5 mm band below the artwork, changing available image height. PDF reader page labels and the assembly map are always included.</small>
    <Field label="Page order"><select value={settings.pageOrder} onChange={e => update('pageOrder', e.target.value)}><option value="row-major">Left to right, top to bottom</option><option value="column-major">Top to bottom, left to right</option></select></Field><small>Letters mark rows; numbers mark columns: A1, A2, B1.</small>
    <Alert>Print at Actual Size / 100%. Turn off Fit to page.</Alert>
  </>;
  const adjustmentFeedback = source && adjusted.edited && !adjusted.ready ? adjusted.phase==='failed' ? <Alert tone="error">{adjusted.error||'The image could not be updated.'}<div className="button-row"><button onClick={adjusted.retry}>Retry preview</button><button onClick={()=>editImage({...TREATMENT_DEFAULTS})}>Restore original image</button></div></Alert> : adjusted.phase==='canceled' ? <Alert>Image update canceled. Your source is still here.<button onClick={adjusted.retry}>Retry preview</button></Alert> : <Alert>Updating your image…<button onClick={adjusted.cancel}>Cancel image update</button></Alert> : null;
  const feedback = <>{adjustmentFeedback}{error && <Alert tone="error">{error}</Alert>}{g.error && (calculator || step !== 1) && <Alert tone="error">{g.error}{g.count>100&&g.count<=400&&!geometry(settings,400).error&&<p>Cloud PDF supports up to 400 sheets for supported files. {cloudLink} · <a href="/pricing">Check file limits and prices</a></p>}</Alert>}{status === 'reading' && <Alert>Reading your image…</Alert>}
    {busy && <Alert><span aria-live="polite">{progress}</span><button onClick={() => { cancel.current.current = true; }}>Cancel</button></Alert>}
    {status === 'ready' && pdf && <Alert tone="success"><strong>Your PDF is ready</strong><p>Print at Actual Size / 100%, then follow the assembly guide.</p><button onClick={() => saveBlob(pdf, 'postertiler-poster.pdf')}>Download again</button></Alert>}
    {status === 'canceled' && <Alert>PDF preparation canceled. Your image and settings are still here.<button onClick={download}>Prepare PDF again</button></Alert>}
    {status === 'failed' && <Alert tone="error">The PDF could not be prepared.<button onClick={download}>Try again</button>{cloudLink}</Alert>}
  </>;
  return <><div className="editor" id="poster-editor" data-clarity-mask="true"><aside className="settings-panel">{calculator ? <div className="calc-controls">{paperControls}{sizeControls}{printControls}{!g.error&&!alternative.error&&<Alert>For the same exact {sizeText(g,settings.unit)} canvas, {alternativeOrientation.toLowerCase()} uses {alternative.count} sheets with the same margins, overlap and label setting.{alternative.count<g.count&&<button onClick={()=>change(s=>({...s,mode:'exact',width:g.width,height:g.height,orientation:alternativeOrientation}))}>Use {alternativeOrientation.toLowerCase()} and save {g.count-alternative.count} sheets</button>}</Alert>}{feedback}<B disabled={!!g.error} onClick={() => { location.href = `/?settings=${encodeURIComponent(JSON.stringify(settings))}#poster-editor`; }}>Create Poster with These Settings <ArrowRight {...icon} /></B></div> : ['Upload', 'Paper Settings', 'Poster Size', 'Print Options', 'Download PDF'].map((title, i) => {
    const n = i + 1;
    return <React.Fragment key={title}><section className={`step ${step === n ? 'active' : ''}`}><button className="step-heading" aria-expanded={step === n} aria-controls={step === n ? `step-${n}` : undefined} disabled={busy} onClick={() => {
      if (n > 1 && !source) { setError('Choose an image to continue.'); setStep(1); } else { setStep(n); setError(''); }
    }}><span className="step-no">{String(n).padStart(2, '0')}</span><strong>{title}</strong>{n === 1 && source && step !== 1 && <img className="upload-thumb" src={source} alt="" />}{step !== n && n < 3 && <span className="step-summary">{n === 1 ? fileName : `${settings.paper} · ${settings.orientation}`}</span>}{step === n ? <CaretUp {...icon} /> : <CaretDown {...icon} />}</button>
    {step === n && <div className="step-body" id={`step-${n}`}>
      {n === 1 && <><div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); read(Array.from(e.dataTransfer.files)); }}><UploadSimple size={36} weight="light" /><h2>Drop an image here</h2><p>or choose a file from your device</p><B onClick={() => {pendingUpscale.current=false;input.current.click();}}>Upload Image</B><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onCancel={()=>{pendingUpscale.current=false;}} onChange={e => { if (e.target.files.length) read(Array.from(e.target.files)); e.target.value = ''; }} /></div><small>JPG, PNG or WebP. You can also paste an image.</small><small>Your image stays in your browser while you make your poster.</small><small>Local safety limits: 32 MB, 24 megapixels, 12,000 px per side and 100 sheets. Device capacity can be lower.</small>{source && <p className="selected-file">{fileName} · {pixels.width} × {pixels.height} px</p>}<h3 className="example-label">Or try an example</h3><div className="example-strip">{samples.slice(0, 4).map(s => <button key={s.id} aria-label={`Try ${s.title}`} onClick={() => requestSample(s)}><img src={`/assets/homepage/thumb-${s.image.replace(/\.png$/, '')}.webp`} alt={s.title} loading="lazy" /></button>)}</div></>}
      {n === 2 && paperControls}{n === 3 && sizeControls}{n === 4 && printControls}
      {n === 5 && <><p>Review your poster, then download the pages to print.</p><dl className="metrics download-metrics"><dt>Finished size</dt><dd>{!g.error && sizeText(g, settings.unit)}</dd><dt>Paper</dt><dd>{settings.paper} · {g.pw > g.ph ? 'Landscape' : 'Portrait'}</dd><dt>Layout</dt><dd>{g.columns} across × {g.rows} down</dd><dt>Poster PDF pages</dt><dd>{g.count}</dd><dt>{g.framed ? 'Panel gap' : 'Overlap'}</dt><dd>{g.framed ? g.gap : settings.overlap} mm</dd></dl><Alert>Choose matching paper. Print at Actual Size / 100% and turn off Fit to page.</Alert><B className="wide" disabled={busy || status === 'reading' || !!g.error || !adjusted.ready} onClick={download}>Download Printable PDF</B><small>Free export. No watermark. No sign-up.</small>{adjusted.edited&&<small>Your image adjustments and art effect are included in this PDF.</small>}<details className="optional-cloud-link"><summary>Need cloud processing?</summary>{adjusted.edited&&<p>These image edits stay in this browser. Cloud PDF starts with a separate file selection.</p>}<p>For more sheets or work your device cannot finish, check cloud file limits and pricing before choosing to upload.</p>{cloudLink} · <a href="/pricing">Compare options</a></details><div className="download-links"><button disabled={busy || !!g.error} onClick={() => auxiliary('calibration')}>Download calibration page <ArrowSquareOut size={14} /></button><button disabled={busy || !!g.error} onClick={() => auxiliary('assembly')}>Download assembly guide <ArrowSquareOut size={14} /></button></div><small>Guide and calibration files are separate from the {g.count} poster pages.</small></>}
      {feedback}{n < 5 && <div className="step-actions"><button className="text-button" disabled={n === 1 || status === 'reading'} onClick={() => setStep(n === 2 ? 'adjustments' : n - 1)}><ArrowLeft {...icon} /> Back</button><B disabled={(!!g.error && n > 1) || status === 'reading'} onClick={next}>Continue</B></div>}
    </div>}</section>{n===1&&<><ImageAdjustments open={step==='adjustments'} hasSource={!!source} disabled={busy||status==='reading'} treatment={treatment} tab={adjustmentTab} onTab={setAdjustmentTab} onOpen={()=>{if(!source){setError('Choose an image to adjust.');setStep(1);}else{setStep('adjustments');setError('');}}} onChange={editImage} onRestore={editImage} onBack={()=>setStep(1)} onContinue={()=>setStep(2)} feedback={<>{error&&<Alert tone="error">{error}</Alert>}{adjustmentFeedback}{adjusted.ready&&<p className="adjustment-readiness" role="status">{adjusted.edited?'Preview updated. These edits will be included in your PDF.':'Original image. Your source file is unchanged.'}</p>}</>}/><section className={`step ai-upscale-step ${step==='upscale'?'active':''}`}><button className="step-heading" disabled={busy||status==='reading'} aria-expanded={step==='upscale'} aria-controls={step==='upscale'?'editor-upscale-controls':undefined} onClick={openUpscaler}><Sparkle size={20} aria-hidden="true"/><strong>AI Image Upscaler</strong><span className="ai-step-price">{aiActive?'Applied':'3 credits'}</span>{step==='upscale'?<CaretUp {...icon}/>:<CaretDown {...icon}/>}</button>{step==='upscale'&&source&&<div className="step-body" id="editor-upscale-controls"><p>Enhance this image without a prompt. Your paper and poster dimensions stay the same.</p><AiTools task="upscale" source={aiActive?aiImage.url:source} pixels={displayPixels} applied={aiActive} onPreview={setAiPreview} onApply={(blob,result)=>{invalidate();setAiImage({url:URL.createObjectURL(blob),baseSource:source,width:result.width,height:result.height});setSettings(s=>({...s,imageRatio:result.width/result.height}));setStep('adjustments');setAdjustmentTab('basic');}} onUndo={()=>{invalidate();setAiImage(null);setSettings(s=>({...s,imageRatio:pixels.width/pixels.height}));}}/><button className="text-button" onClick={()=>setStep(2)}>Continue to paper settings<ArrowRight size={16}/></button></div>}</section></>}</React.Fragment>;
  })}{!calculator && source && <button className="reset-link" disabled={busy} onClick={() => setReset(true)}><ArrowCounterClockwise size={15} /> Reset print settings</button>}</aside><div className="editor-preview-column">{demo && <div className="demo-preview-note"><span><strong>Example preview</strong><small>Alpine reflections · choose it to start editing</small></span><button className="underlined" disabled={status === 'reading'} onClick={() => requestSample(demoSample)}>Use this example <ArrowRight size={15} aria-hidden="true" /></button></div>}{source&&(adjusted.edited||aiActive||sourceIsAi)&&<div className="image-preview-status" data-ready={adjusted.ready}>{adjusted.ready?(aiActive||sourceIsAi?'AI image · included in PDF · generated detail may vary':'Adjusted image · included in PDF'):'Preparing adjusted preview · export will wait'}</div>}{step==='upscale'&&source&&!calculator?<AiImagePreview {...aiPreview} source={aiPreview?aiPreview.source:(aiActive?aiImage.url:source)} sourcePixels={displayPixels}/>:<Preview source={demo ? '/assets/homepage/alpine-lake-preview.webp' : adjusted.url} settings={demo ? sampleSettings(demoSample) : settings} empty={!demo && !source && !calculator} pixels={demo ? {width:demoSample.width,height:demoSample.height} : displayPixels} layoutOnly={calculator} withSizeReference={!calculator} onSourceError={demo ? setDemoFailed : undefined} />}</div></div>
  {replacement && <div className="modal-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title"><button className="dialog-close" data-dismiss aria-label="Close replace image dialog" onClick={() => setReplacement(null)}><X {...icon} /></button><h2 id="replace-title">Replace your image?</h2><p>Using {replacement.sample.title} replaces your current image and print settings. Keep your current poster if you are still working on it.</p><div className="button-row"><B secondary onClick={() => setReplacement(null)}>Keep my poster</B><B onClick={() => { const next = replacement; setReplacement(null); chooseSample(next.sample, next.targetStep); }}>Use example instead</B></div></section></div>}
  {reset && <div className="modal-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title"><button className="dialog-close" data-dismiss aria-label="Close reset dialog" onClick={() => setReset(false)}><X {...icon} /></button><h2 id="reset-title">Reset print settings?</h2><p>Your image will stay selected.</p><div className="button-row"><B secondary onClick={() => setReset(false)}>Keep settings</B><B onClick={() => { change(() => ({ ...DEFAULTS, imageRatio: displayPixels.width / displayPixels.height })); setStep(2); setReset(false); }}>Reset settings</B></div></section></div>}</>;
});
