import DownloadReady from './DownloadReady';
import React, { useEffect, useRef, useState } from 'react';
import { UploadSimple, ArrowUp, ArrowDown, ArrowClockwise, X, ArrowRight } from '@phosphor-icons/react';
import { B, Field, Alert } from './ui';
import ToolControls from './ToolControls';
import { inspectFile, loadImage, saveBlob } from './export';
import { MERGE_DEFAULTS, imageSheetLayout, TOOL_LIMITS } from './engine/tools-model.ts';
import { documentJob } from './background';
import { trackEvent } from './analytics';
function SheetPreview({ item, settings }) {
  const canvas = useRef(); let model, error = '';
  try { if (item) model = imageSheetLayout(settings, item.width, item.height, item.rotation); } catch (e) { error = e.message; }
  useEffect(() => {
    if (!item || !model || error) return;
    let alive = true; const url = URL.createObjectURL(item.file);
    (async () => {
      try {
        const image = await loadImage(url); if (!alive || !canvas.current) return;
        const { geometry: g, placement: p } = model, c = canvas.current;
        const scale = Math.min(1400 / g.pw, 1400 / g.ph); c.width = Math.round(g.pw * scale); c.height = Math.round(g.ph * scale);
        const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, g.pw, g.ph);
        ctx.save(); ctx.beginPath(); ctx.rect(g.margins.left, g.margins.top, g.printableW, g.printableH); ctx.clip();
        const dx = item.rotation === 90 || item.rotation === 180 ? p.width : 0;
        const dy = item.rotation === 180 || item.rotation === 270 ? p.height : 0;
        ctx.translate(g.margins.left + p.x + dx, g.margins.top + p.y + dy); ctx.rotate(item.rotation * Math.PI / 180);
        const ratio = p.width / (item.rotation % 180 ? item.height : item.width);
        ctx.drawImage(image, 0, 0, item.width * ratio, item.height * ratio); ctx.restore();
      } finally { URL.revokeObjectURL(url); }
    })().catch(() => {});
    // Release in finally after the pending image load settles; revoking before
    // the queued browser fetch starts can break rapid remove/reorder actions.
    return () => { alive = false; };
  }, [item, settings]);
  return <div className="document-preview"><div className="document-preview-heading"><strong>{item ? 'Selected page preview' : 'Your combined PDF'}</strong><span>{item && model && `${model.geometry.pw} × ${model.geometry.ph} mm`}</span></div><div className="sheet-preview-stage">{error ? <Alert tone="error">{error}</Alert> : item ? <canvas ref={canvas} aria-label="Selected image on its PDF page" role="img" /> : <div className="empty-preview"><UploadSimple size={44} weight="thin" /><h2>One image per page</h2><p>Add images, arrange them, then download one PDF.</p></div>}</div><p className="print-hint">Transparency prints on white. Image proportions are preserved.</p></div>;
}
export default function ImageToPdf() {
  const [readyDialog,setReadyDialog]=useState(false);
  const [items, setItems] = useState([]), [selected, setSelected] = useState(null), [settings, setSettings] = useState(MERGE_DEFAULTS);
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(''), [pdf, setPdf] = useState(null);
  const input = useRef(), itemsRef = useRef([]), readId = useRef(0), cancel = useRef({ current: false });
  const busy = status === 'exporting' || status === 'reading';
  const active = items.find(item => item.id === selected) || items[0];
  let layoutError = ''; try { for (const item of items) imageSheetLayout(settings, item.width, item.height, item.rotation); } catch (e) { layoutError = e.message; }
  const changeItems = list => { itemsRef.current = list; setItems(list); setPdf(null); setError(''); setStatus(''); };
  useEffect(() => () => { ++readId.current; cancel.current.current = true; for (const item of itemsRef.current) URL.revokeObjectURL(item.thumbnail); }, []);
  const read = async files => {
    if (!files.length || busy) return;
    const id = ++readId.current, created = []; setStatus('reading'); setError(''); setPdf(null);
    try {
      if (items.length + files.length > TOOL_LIMITS.images) throw new Error('Combine up to 20 images in one PDF. Remove an image before adding more.');
      if ([...items.map(item => item.file), ...files].reduce((sum, file) => sum + file.size, 0) > TOOL_LIMITS.mergeBytes) throw new Error('Keep the selected files within 64 MB in total.');
      let total = items.reduce((sum, item) => sum + item.width * item.height, 0);
      for (const file of files) { const meta = await inspectFile(file); total += meta.width * meta.height; }
      if (total > TOOL_LIMITS.mergePixels) throw new Error('Keep the selected images within 48 megapixels in total.');
      for (const [index, file] of files.entries()) {
        if (id !== readId.current) throw new Error('canceled');
        setProgress(`Reading image ${index + 1} of ${files.length}…`);
        const url = URL.createObjectURL(file);
        try {
          const image = await loadImage(url); const c = document.createElement('canvas'), ratio = Math.min(1, 180 / Math.max(image.naturalWidth, image.naturalHeight));
          c.width = Math.max(1, Math.round(image.naturalWidth * ratio)); c.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          const ctx = c.getContext('2d'); if (!ctx) throw new Error('This device could not open the image.');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(image, 0, 0, c.width, c.height);
          const thumbnail = await new Promise(resolve => c.toBlob(resolve, 'image/jpeg', .85));
          if (!thumbnail) throw new Error('This image could not be opened.');
          created.push({ id: crypto.randomUUID(), file, width: image.naturalWidth, height: image.naturalHeight, rotation: 0, thumbnail: URL.createObjectURL(thumbnail) });
          c.width = c.height = 1;
        } finally { URL.revokeObjectURL(url); }
      }
      if (id !== readId.current) throw new Error('canceled');
      changeItems([...items, ...created]); if (!selected) setSelected(created[0].id); trackEvent('poster_start', { tool: 'image_pdf' });
    } catch (e) {
      for (const item of created) URL.revokeObjectURL(item.thumbnail);
      if (id === readId.current) { setError(e.message === 'canceled' ? '' : e.message); setStatus(e.message === 'canceled' ? 'canceled' : ''); }
    }
  };
  const move = (index, direction) => {
    const next = [...items], target = index + direction; if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; changeItems(next);
  };
  const exportPdf = async () => {
    if (!items.length || layoutError || busy) return;
    const token = { current: false }; cancel.current = token; setError(''); setPdf(null); setStatus('exporting'); setProgress('Preparing your images…');
    try {
      const result = await documentJob('merge-images', { items: items.map(({ file, rotation }) => ({ file, rotation })), settings }, token, (page, total) => setProgress(`Preparing PDF: ${page} of ${total} steps`));
      setPdf(result.bytes); setReadyDialog(true); setStatus('ready'); trackEvent('pdf_ready', { tool: 'image_pdf', paper: settings.paper, sheet_count: items.length });
    } catch (e) { setStatus(e.message === 'canceled' ? 'canceled' : 'failed'); if (e.message !== 'canceled') setError(e.message); trackEvent(e.message === 'canceled' ? 'pdf_canceled' : 'pdf_failed', { tool: 'image_pdf' }); }
  };
  return <main>{readyDialog&&pdf&&<DownloadReady bytes={pdf} name="postertiler-images.pdf" onClose={()=>setReadyDialog(false)}/>}<div className="page-intro"><small>LOCAL PDF TOOLS</small><h1>Image to PDF</h1><p>Combine multiple images into one PDF. Arrange the pages, rotate each image and choose your paper.</p></div>
    <div className="document-tool" data-clarity-mask="true"><section className="document-controls" aria-label="Image to PDF settings"><fieldset disabled={busy}>
      <h2>01 Choose images</h2><div className="tool-dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) read(Array.from(e.dataTransfer.files)); }}><UploadSimple size={28} /><p>Drop JPG, PNG or WebP images here</p><B onClick={() => input.current.click()}>Choose Images</B><input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => { read(Array.from(e.target.files)); e.target.value = ''; }} /></div>
      <small>Up to 20 images, 64 MB and 48 MP combined. Each image: up to 32 MB / 24 MP / 12,000 px per side. Device capacity can be lower.</small>
      <ol className="image-order-list" aria-label="PDF image order">{items.map((item, index) => <li key={item.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', item.id)} onDragOver={e => e.preventDefault()} onDrop={e => {
        e.preventDefault(); if (busy) return; const from = items.findIndex(i => i.id === e.dataTransfer.getData('text/plain')); if (from < 0) return;
        const next = [...items], [moved] = next.splice(from, 1); next.splice(index, 0, moved); changeItems(next);
      }} className={active?.id === item.id ? 'selected' : ''}>
        <button className="image-select" aria-label={`Preview page ${index + 1}`} aria-pressed={active?.id === item.id} onClick={() => setSelected(item.id)}><img src={item.thumbnail} style={{ transform: `rotate(${item.rotation}deg)` }} alt="" /><span><strong>Page {index + 1}</strong><span className="file-label">{item.file.name}</span><small>{item.rotation}° · {item.width} × {item.height} px</small></span></button>
        <div className="image-row-actions"><button aria-label={`Move page ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={17} /></button><button aria-label={`Move page ${index + 1} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={17} /></button><button aria-label={`Rotate page ${index + 1} clockwise`} onClick={() => changeItems(items.map(i => i.id === item.id ? { ...i, rotation: (i.rotation + 90) % 360 } : i))}><ArrowClockwise size={17} /></button><button aria-label={`Remove page ${index + 1}`} onClick={() => { URL.revokeObjectURL(item.thumbnail); changeItems(items.filter(i => i.id !== item.id)); }}><X size={17} /></button></div>
      </li>)}</ol>
      {items.length > 0 && <small>Drag to reorder, or use the up/down buttons. The selected page appears in the preview.</small>}
      <h2>02 Paper and placement</h2><ToolControls settings={settings} onChange={value => { setSettings(value); setPdf(null); setStatus(''); }} />
      <Field label="Image placement"><select value={settings.placement} onChange={e => { setSettings(s => ({ ...s, placement: e.target.value })); setPdf(null); setStatus(''); }}><option value="fit">Fit whole image</option><option value="fill">Fill and crop</option></select></Field>
      <h2>03 Download</h2><p>{items.length} image{items.length === 1 ? '' : 's'} → {items.length} PDF page{items.length === 1 ? '' : 's'}</p>
      {layoutError && <Alert tone="error">{layoutError}</Alert>}<B className="wide" disabled={!items.length || !!layoutError} onClick={exportPdf}>Download Combined PDF</B><small>Free. No watermark. No sign-up. Files stay in your browser.</small>
    </fieldset>
    {busy && <Alert>{progress}<button onClick={() => { if (status === 'reading') { ++readId.current; setStatus('canceled'); } else cancel.current.current = true; }}>Cancel</button></Alert>}
    {error && <Alert tone="error">{error}</Alert>}{status === 'ready' && pdf && <Alert tone="success">Your combined PDF is ready.<button onClick={() => setReadyDialog(true)}>Download or share PDF</button></Alert>}{status === 'canceled' && <Alert>Preparation canceled. Your existing images and settings are still here.</Alert>}
    </section><SheetPreview item={active} settings={settings} /></div>
    <section className="section prose"><h2>One image per page, or one image across pages?</h2><p>This tool combines separate images into a single document, with one image on each page. To enlarge one image over several sheets, use the <a href="/">poster maker</a>. To split an existing PDF at its physical size, use <a href="/tools/pdf-poster-printer">PDF Poster Printer <ArrowRight size={15} /></a>.</p><h2>Before printing</h2><p>Match paper and orientation to the PDF. Automatic orientation is chosen for each image after rotation. Fit preserves the full picture; Fill crops its edges. Your source files and EXIF metadata are not attached to the combined document.</p></section>
  </main>;
}
