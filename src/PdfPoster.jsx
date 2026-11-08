import DownloadReady from './DownloadReady';
import React, { useEffect, useRef, useState } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import { PRINT_DEFAULTS, sizeText } from './geometry';
import { pdfGroups, TOOL_LIMITS } from './engine/tools-model.ts';
import { B, Field, NumberInput, Alert } from './ui';
import ToolControls from './ToolControls';
import Preview from './Preview';
import { documentJob } from './background';
import { saveBlob, calibration } from './export';
import { trackEvent } from './analytics';
function usePdfPreview(file, pageIndex) {
  const [source, setSource] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const document = useRef(null), version = useRef(0);
  useEffect(() => {
    const id = ++version.current; setSource(null); setError(''); document.current = null;
    if (!file) return;
    let alive = true, task;
    (async () => {
      const { openPdf } = await import('./pdf-renderer'); if (!alive) return;
      task = openPdf(new Uint8Array(await file.arrayBuffer())); const pdf = await task.promise;
      if (!alive || id !== version.current) { await task.destroy(); return; }
      document.current = pdf; setLoading(true); setSource({ ready: id });
    })().catch(() => { if (alive) { setError('The preview could not be rendered. Check this PDF in a reader before exporting.'); setLoading(false); } });
    return () => { alive = false; ++version.current; document.current = null; task?.destroy().catch(() => {}); };
  }, [file]);
  const ready = source && typeof source === 'object' ? source.ready : null;
  const [previewResult, setPreviewResult] = useState(null);
  // A completed preview owns its URL until it is replaced. Rapid page/range
  // changes can reuse the same completed page while a new render is pending.
  useEffect(() => () => { if (previewResult?.url) URL.revokeObjectURL(previewResult.url); }, [previewResult]);
  useEffect(() => {
    const pdf = document.current; if (!file || !pdf) { setPreviewResult(null); return; }
    let alive = true, renderTask, objectUrl; setLoading(true); setError('');
    (async () => {
      const page = await pdf.getPage(pageIndex + 1); if (!alive) return;
      const natural = page.getViewport({ scale: 1 }); const scale = Math.min(2, 1600 / Math.max(natural.width, natural.height));
      const viewport = page.getViewport({ scale }), canvas = window.document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
      renderTask = page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport, background: 'rgb(255,255,255)', annotationMode: 0 });
      await renderTask.promise; if (!alive) return;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob || !alive) return;
      objectUrl = URL.createObjectURL(blob); setPreviewResult({ file, pageIndex, url: objectUrl }); setLoading(false); canvas.width = canvas.height = 1; page.cleanup();
    })().catch(() => { if (alive) { setError('This page could not be previewed. Try another source page or re-save the PDF.'); setLoading(false); } });
    return () => { alive = false; renderTask?.cancel(); };
  }, [file, pageIndex, ready]);
  const url = previewResult?.file === file && previewResult.pageIndex === pageIndex ? previewResult.url : null;
  return { source: url, error, loading };
}
export default function PdfPoster() {
  const [readyDialog,setReadyDialog]=useState(false);
  const [file, setFile] = useState(null), [info, setInfo] = useState(null), [settings, setSettings] = useState({ ...PRINT_DEFAULTS });
  const [range, setRange] = useState('1'), [scaleMode, setScaleMode] = useState('actual'), [percent, setPercent] = useState(100), [previewIndex, setPreviewIndex] = useState(0);
  const [status, setStatus] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(''), [pdf, setPdf] = useState(null);
  const input = useRef(), cancel = useRef({ current: false }), requestId = useRef(0);
  const busy = ['reading', 'exporting'].includes(status), scale = scaleMode === 'actual' ? 100 : Number(percent);
  let model, modelError = '';
  try { if (info) model = pdfGroups(info, settings, range, scale); } catch (e) { modelError = e.message; }
  const previewGroup = model?.groups.find(group => group.sourceIndex === previewIndex) || model?.groups[0];
  const { source, error: previewError, loading } = usePdfPreview(file, previewGroup?.sourceIndex || 0);
  const invalidate = () => { setPdf(null); setError(''); setStatus(''); };
  useEffect(() => () => { ++requestId.current; cancel.current.current = true; }, []);
  const read = async files => {
    if (files.length !== 1) { setError('Choose one PDF file to tile.'); return; }
    if (busy) return; const id = ++requestId.current, token = { current: false }; cancel.current = token;
    setStatus('reading'); setError(''); setPdf(null);
    try {
      if (files[0].size > TOOL_LIMITS.pdfBytes) throw new Error('Choose a PDF of 64 MB or less.');
      const result = await documentJob('inspect-pdf', { file: files[0] }, token);
      if (id !== requestId.current) return;
      setFile(files[0]); setInfo(result.info); setRange(result.info.pages.length === 1 ? '1' : `1-${result.info.pages.length}`); setPreviewIndex(0); setStatus(''); trackEvent('poster_start', { tool: 'pdf_poster' });
    } catch (e) { if (id === requestId.current) { setStatus(e.message === 'canceled' ? 'canceled' : ''); if (e.message !== 'canceled') setError(e.message); } }
  };
  const exportPdf = async () => {
    if (!file || !model || busy) return;
    const token = { current: false }; cancel.current = token; setError(''); setPdf(null); setStatus('exporting'); setProgress('Preparing source PDF…');
    try {
      const result = await documentJob('tile-pdf', { file, settings, range, percent: scale }, token, (page, total) => setProgress(`Preparing sheet ${page} of ${total}…`));
      setPdf(result.bytes); setReadyDialog(true); setStatus('ready'); trackEvent('pdf_ready', { tool: 'pdf_poster', paper: settings.paper, sheet_count: model.count });
    } catch (e) { setStatus(e.message === 'canceled' ? 'canceled' : 'failed'); if (e.message !== 'canceled') setError(e.message); trackEvent(e.message === 'canceled' ? 'pdf_canceled' : 'pdf_failed', { tool: 'pdf_poster' }); }
  };
  const auxiliary = async kind => {
    if (!model) return;
    try {
      if (kind === 'calibration') await calibration(previewGroup.settings);
      else { const { pdfAssembly } = await import('./engine/document-tools.ts'); saveBlob(await pdfAssembly(info, settings, range, scale), 'postertiler-pdf-assembly.pdf'); }
    } catch { setError('This guide could not be prepared. Check the settings and try again.'); }
  };
  return <main>{readyDialog&&pdf&&<DownloadReady bytes={pdf} printedLabels={settings.labels} name="postertiler-tiled-pdf.pdf" onClose={()=>setReadyDialog(false)}/>}<div className="page-intro"><small>LOCAL PDF TOOLS</small><h1>PDF Poster Printer</h1><p>Split a PDF over ordinary sheets at its intended physical size. Keep existing text and vector paths in the exported PDF.</p></div>
    <div className="document-tool" data-clarity-mask="true"><section className="document-controls" aria-label="PDF poster settings"><fieldset disabled={busy}>
      <h2>01 Choose a PDF</h2><div className="tool-dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); read(Array.from(e.dataTransfer.files)); }}><UploadSimple size={28} /><p>Drop a PDF here</p><B onClick={() => input.current.click()}>Choose PDF</B><input ref={input} hidden type="file" accept="application/pdf,.pdf" onChange={e => { if (e.target.files.length) read(Array.from(e.target.files)); e.target.value = ''; }} /></div><small>Local processing. Up to 64 MB / 100 source pages / 100 output sheets. Source images above 24 MP, encrypted PDFs and optional layers are not supported.</small>
      {file && <p className="file-label">{file.name} · {info.pages.length} source page{info.pages.length === 1 ? '' : 's'}</p>}
      <Field label="Source pages"><input value={range} disabled={!info} onChange={e => { invalidate(); setRange(e.target.value); }} placeholder="1, 3-5" /></Field><small>Use comma-separated pages and ascending ranges. Repeated page numbers are included once.</small>
      <h2>02 Paper and scale</h2><ToolControls settings={settings} units onChange={value => { invalidate(); setSettings(value); }} />
      <Field label="PDF scale"><select value={scaleMode} onChange={e => { invalidate(); setScaleMode(e.target.value); }}><option value="actual">Actual Size / 100%</option><option value="custom">Custom scale</option></select></Field>
      {scaleMode === 'custom' && <NumberInput label="Scale" value={percent} unit="%" min={1} onChange={value => { invalidate(); setPercent(value); }} />}
      <NumberInput label="Overlap" value={settings.overlap} unit="mm" onChange={value => { invalidate(); setSettings(s => ({ ...s, overlap: value })); }} />
      <label className="check"><input type="checkbox" checked={settings.cutGuides} onChange={e => { invalidate(); setSettings(s => ({ ...s, cutGuides: e.target.checked })); }} />Cut guides</label>
      <label className="check"><input type="checkbox" checked={settings.labels} onChange={e => { invalidate(); setSettings(s => ({ ...s, labels: e.target.checked })); }} />Printed page labels</label><small>Prints source / position, page number and TOP ↑ in a removable 5 mm band. Exact source dimensions stay unchanged; the reserved band can require additional sheets.</small>
      <Field label="Page order"><select value={settings.pageOrder} onChange={e => { invalidate(); setSettings(s => ({ ...s, pageOrder: e.target.value })); }}><option value="row-major">Left to right, top to bottom</option><option value="column-major">Top to bottom, left to right</option></select></Field>
      <h2>03 Review and download</h2>{model && <><dl className="metrics"><dt>Source pages selected</dt><dd>{model.groups.length}</dd><dt>Poster PDF sheets</dt><dd>{model.count}</dd><dt>Scale</dt><dd>{scale}%</dd></dl><ul className="source-page-summary">{model.groups.map(group => <li key={group.sourceIndex}>Source {group.sourceIndex + 1}: {sizeText(group.geometry, settings.unit)} · {group.geometry.count} sheets</li>)}</ul></>}
      {modelError && <Alert tone="error">{modelError}</Alert>}
      {info?.unembeddedFonts && <Alert tone="warning">Some source fonts are not embedded. They remain unembedded in the export; appearance can depend on the PDF reader. Embed those fonts in the source for predictable printing.</Alert>}
      {info?.pages.some(page => page.links) && <p className="micro">Interactive links are omitted. Printable annotations and form fields must be flattened before export.</p>}
      <B className="wide" disabled={!file || !model} onClick={exportPdf}>Download Tiled PDF</B><small>Free, no watermark, no sign-up. Scanned pages remain images; the tool does not invent extra detail.</small>
      {model && <div className="download-links"><button onClick={() => auxiliary('calibration')}>Download calibration page</button><button onClick={() => auxiliary('assembly')}>Download assembly maps</button></div>}
    </fieldset>
    {busy && <Alert>{status === 'reading' ? 'Reading PDF pages…' : progress}<button onClick={() => { cancel.current.current = true; }}>Cancel</button></Alert>}
    {error && <Alert tone="error">{error}</Alert>}{status === 'ready' && pdf && <Alert tone="success">Your tiled PDF is ready.<button onClick={() => setReadyDialog(true)}>Download or share PDF</button></Alert>}{status === 'canceled' && <Alert>Preparation canceled. Your existing PDF and settings are still here.</Alert>}
    </section><div className="pdf-tool-preview">{model && <Field label="Preview source page"><select value={previewGroup?.sourceIndex ?? 0} onChange={e => setPreviewIndex(Number(e.target.value))}>{model.groups.map(group => <option key={group.sourceIndex} value={group.sourceIndex}>Source page {group.sourceIndex + 1}</option>)}</select></Field>}
      {(loading || previewError) && <Alert tone={previewError ? 'warning' : 'info'}>{previewError || 'Rendering the selected source page…'}</Alert>}
      <Preview source={source} settings={previewGroup?.settings || settings} empty={!source || !previewGroup} pixels={{ width: 0, height: 0 }} />
      <p className="print-hint">The screen preview is rendered for display. Export uses the original PDF page content. Print single-sided at Actual Size / 100% and measure a calibration page first.</p>
    </div></div>
    <section className="section prose"><h2>How PDF tiling works</h2><p>The source PDF’s visible page area, rotation and physical-size information determine its dimensions. At 100%, those dimensions are retained. A custom scale changes them proportionally; it does not stretch a page to fit the last sheet.</p><h2>Supported PDF content</h2><p>Existing embedded fonts, text and vector paths are copied into the output. The tool does not add missing fonts or turn a scan into vector artwork. Flatten layers, printable annotations and form fields before importing. Interactive actions and links are not part of the printed export.</p><p>Use the <a href="/guides/how-to-print-a-pdf-at-actual-size">actual-size printing guide</a> and the separate assembly maps. Each source page has its own poster layout and labels such as P2-A1.</p></section>
  </main>;
}
