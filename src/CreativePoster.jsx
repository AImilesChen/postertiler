import React, { useEffect, useRef, useState } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import { B, Field, NumberInput, Alert } from './ui';
import ToolControls from './ToolControls';
import Preview from './Preview';
import { DEFAULTS, geometry, sizeText, MM_PER_UNIT } from './geometry';
import { FULL_CROP, cropRect, lifeSettings, validateEffect } from './engine/creative.ts';
import { loadImage, inspectFile, makePoster, saveBlob, assembly, calibration } from './export';
import { creativeJob } from './creative-job';
import { imagePath, samples } from './data';
import { creativeExample } from './example-links';

export default function CreativePoster({ kind }) {
  const life = kind === 'life-size';
  const [file, setFile] = useState(null), [original, setOriginal] = useState(null), [pixels, setPixels] = useState(null);
  const [crop, setCrop] = useState({ ...FULL_CROP }), [height, setHeight] = useState(1800), [unit, setUnit] = useState('cm');
  const [paper, setPaper] = useState({ ...DEFAULTS }), [effect, setEffect] = useState({ effect: 'dots', cell: 12, colour: false, contrast: 1, invert: false });
  const [result, setResult] = useState(null), [pdf, setPdf] = useState(null), [status, setStatus] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const input = useRef(), token = useRef({ current: false }), readVersion = useRef(0);
  const busy = ['reading', 'processing', 'exporting'].includes(status);
  let currentPixels = pixels, settings = { ...paper, unit, imageRatio: pixels ? pixels.width / pixels.height : 1 }, validation = '';
  try {
    if (pixels && life) { currentPixels = cropRect(pixels.width, pixels.height, crop); settings = { ...lifeSettings(height, currentPixels, paper), unit }; }
    if (!life) validateEffect(effect);
  } catch (e) { validation = e.message; }
  const g = geometry(settings), outputError = validation || g.error;
  useEffect(() => () => { token.current.current = true; ++readVersion.current; }, []);
  useEffect(() => { if (!original) return; return () => URL.revokeObjectURL(original); }, [original]);
  useEffect(() => { if (!result) return; return () => URL.revokeObjectURL(result.url); }, [result]);
  const invalidate = (processed = false) => {
    token.current.current = true; token.current = { current: false }; setPdf(null); setStatus(''); setError('');
    if (processed) setResult(null);
  };
  const choose = async files => {
    if (files.length !== 1) { setError('Choose one JPG, PNG or WebP image.'); return; }
    const id = ++readVersion.current; invalidate(); setStatus('reading'); let url;
    try {
      await inspectFile(files[0]); url = URL.createObjectURL(files[0]); const img = await loadImage(url);
      if (id !== readVersion.current) { URL.revokeObjectURL(url); return; }
      setOriginal(url); setFile(files[0]); setPixels({ width: img.naturalWidth, height: img.naturalHeight }); setCrop({ ...FULL_CROP }); setResult(null); setStatus('');
    } catch (e) { if (url) URL.revokeObjectURL(url); if (id === readVersion.current) { setError(e.message || 'This image could not be opened.'); setStatus(''); } }
  };
  const example = async (selected) => {
    const version = ++readVersion.current; invalidate(); setStatus('reading');
    try {
      const s = selected?.id ? selected : samples.find(s => s.id === (life ? 'portrait' : 'geometry'));
      const response = await fetch(imagePath(s.image)); if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (version === readVersion.current) await choose([new File([blob], s.image, { type: 'image/png' })]);
    } catch { if (version === readVersion.current) { setError('The example could not be loaded. Choose an image from your device.'); setStatus(''); } }
  };
  useEffect(() => {
    const init = creativeExample(location.search, kind);
    if (!life) setEffect(current => ({ ...current, effect: init.effect }));
    if (init.sample) example(init.sample);
  }, [kind]);
  const process = async () => {
    if (!file || outputError) { setError(outputError || 'Choose an image first.'); return; }
    const active = { current: false }; token.current.current = true; token.current = active;
    setStatus('processing'); setError(''); setPdf(null); setProgress('Preparing image…');
    try {
      const out = await creativeJob({ blob: file, crop: life ? crop : FULL_CROP, options: life ? null : effect }, active,
        ratio => setProgress(`Rendering effect: ${Math.round(ratio * 100)}%`));
      if (active !== token.current) return;
      setResult({ ...out, url: URL.createObjectURL(out.blob) }); setStatus('processed');
    } catch (e) { if (active !== token.current) return; setStatus(active.current || e.message === 'canceled' ? 'canceled' : 'failed'); if (e.message !== 'canceled') setError(e.message); }
  };
  const download = async () => {
    if (!result || outputError) return;
    const active = { current: false }; token.current.current = true; token.current = active;
    setStatus('exporting'); setPdf(null); setError(''); setProgress('Preparing PDF…');
    try {
      const bytes = await makePoster(result.url, settings, (p, total) => setProgress(`Preparing page ${p} of ${total}`), active, true);
      if (active !== token.current) return;
      setPdf(bytes); setStatus('ready'); saveBlob(bytes, `postertiler-${kind}.pdf`);
    } catch (e) { if (active !== token.current) return; setStatus(active.current || e.message === 'canceled' ? 'canceled' : 'failed'); if (e.message !== 'canceled') setError(e.message); }
  };
  const auxiliary = async type => { try { await (type === 'assembly' ? assembly(settings) : calibration(settings)); } catch { setError('The guide could not be prepared. Check your settings.'); } };
  const shown = result?.url || (life ? null : original);
  return <main><div className="page-intro"><small>FREE LOCAL TOOL</small><h1>{life ? 'Life Size Poster Maker' : 'Halftone Poster Maker'}</h1><p>{life ? 'Select the subject bounds, set its physical height and print it over ordinary sheets.' : 'Make dot screens, black-and-white dithering or a CMYK-style screen, then download a tiled poster PDF.'}</p></div>
    <div className="document-editor creative-editor" data-clarity-mask="true"><section className="document-controls"><fieldset disabled={busy}>
      <h2>01 Choose an image</h2><div className="tool-dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) choose([...e.dataTransfer.files]); }}><UploadSimple size={28} /><p>JPG, PNG or WebP · processed in your browser</p><B secondary onClick={() => input.current.click()}>Choose Image</B><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { if (e.target.files.length) choose([...e.target.files]); e.target.value = ''; }} /></div><button className="underlined" onClick={example}>Try an example</button>
      {file && <p className="file-label">{file.name} · {pixels.width} × {pixels.height} px</p>}<small>Up to 32 MB, 24 megapixels and 100 output sheets. Capacity depends on your device.</small>
      <h2>02 {life ? 'Select and measure' : 'Choose an effect'}</h2>
      {life ? <>
        <p>Set the top at the head and the bottom at the feet. The selected rectangle is the part assigned the finished height; proportions stay locked.</p>
        {original && <div className="subject-crop"><img src={original} alt="Source image with subject bounds" /><div aria-hidden className="subject-bounds" style={{ left: `${crop.left}%`, top: `${crop.top}%`, width: `${crop.right - crop.left}%`, height: `${crop.bottom - crop.top}%` }} /></div>}
        <div className="field-pair">{['top', 'bottom', 'left', 'right'].map(edge => <NumberInput key={edge} label={`${edge[0].toUpperCase() + edge.slice(1)} bound`} unit="%" value={crop[edge]} onChange={value => { invalidate(true); setCrop(s => ({ ...s, [edge]: value })); }} />)}</div>
        <button className="underlined" onClick={() => { invalidate(true); setCrop({ ...FULL_CROP }); }}>Use whole image</button>
        <Field label="Height units"><select value={unit} onChange={e => { invalidate(); setUnit(e.target.value); }}><option>cm</option><option>mm</option><option>in</option></select></Field>
        <NumberInput label="Finished subject height" unit={unit} value={height === '' ? '' : Number((height / MM_PER_UNIT[unit]).toFixed(3))} step={.1} onChange={value => { invalidate(); setHeight(value === '' ? '' : value * MM_PER_UNIT[unit]); }} />
        <small>The selected rectangle keeps its proportions. Background inside it is retained. Automatic background removal is not available in this release.</small>
      </> : <>
        <Field label="Effect"><select value={effect.effect} onChange={e => { invalidate(true); setEffect(s => ({ ...s, effect: e.target.value, invert: false })); }}><option value="dots">Halftone dots</option><option value="dither">Black-and-white dither</option><option value="cmyk">CMYK-style screen</option></select></Field>
        {effect.effect !== 'dither' && <NumberInput label="Dot spacing" unit="source px" value={effect.cell} min={2} onChange={value => { invalidate(true); setEffect(s => ({ ...s, cell: value })); }} />}
        <NumberInput label="Contrast" step={.1} min={.25} value={effect.contrast} onChange={value => { invalidate(true); setEffect(s => ({ ...s, contrast: value })); }} />
        {effect.effect === 'dots' && <label className="check"><input type="checkbox" checked={effect.colour} onChange={e => { invalidate(true); setEffect(s => ({ ...s, colour: e.target.checked })); }} />Use image colours for dots</label>}
        {effect.effect !== 'cmyk' && <label className="check"><input type="checkbox" checked={effect.invert} onChange={e => { invalidate(true); setEffect(s => ({ ...s, invert: e.target.checked })); }} />Invert tones</label>}
        <small>{effect.effect === 'cmyk' ? 'Four rotated cyan, magenta, yellow and black screens are combined into one RGB artwork. This is a visual effect, not prepress CMYK plates or an ICC colour proof.' : 'The effect is rendered at source pixel dimensions. Dot spacing changes the artwork; no AI calls are used.'}</small>
      </>}
      <B secondary className="wide" disabled={!file || !!outputError} onClick={process}>{life ? 'Apply Subject Bounds' : 'Apply Effect'}</B>
      <h2>03 Paper and poster</h2><ToolControls settings={paper} onChange={value => { invalidate(); setPaper(value); }} />
      {!life && <div className="field-pair">{[['columns', 'Sheets across'], ['rows', 'Sheets down']].map(([key, label]) => <NumberInput key={key} label={label} min={1} value={paper[key]} onChange={value => { invalidate(); setPaper(s => ({ ...s, [key]: value })); }} />)}</div>}
      <NumberInput label="Overlap" value={paper.overlap} unit="mm" onChange={value => { invalidate(); setPaper(s => ({ ...s, overlap: value })); }} />
      {['cutGuides', 'labels'].map((key, i) => <label className="check" key={key}><input type="checkbox" checked={paper[key]} onChange={e => { invalidate(); setPaper(s => ({ ...s, [key]: e.target.checked })); }} />{i ? 'Printed page labels' : 'Cut guides'}</label>)}
      <small>Printed labels use a removable 5 mm band. PDF reader labels and the separate assembly map are always available.</small>
      <Field label="Page order"><select value={paper.pageOrder} onChange={e => { invalidate(); setPaper(s => ({ ...s, pageOrder: e.target.value })); }}><option value="row-major">Left to right, top to bottom</option><option value="column-major">Top to bottom, left to right</option></select></Field>
      {!outputError && <dl className="metrics"><dt>Finished size</dt><dd>{sizeText(g, unit)}</dd><dt>Poster sheets</dt><dd>{g.count}</dd>{!life && effect.effect !== 'dither' && pixels && <><dt>Approx. dot spacing on paper</dt><dd>{(effect.cell * g.width / pixels.width).toFixed(2)} mm</dd></>}</dl>}
      <h2>04 Download</h2><B className="wide" disabled={!result || !!outputError} onClick={download}>Download Printable PDF</B><small>{result ? 'Full rendered pixels embedded losslessly. Free, no watermark and no sign-up.' : `Choose an image and ${life ? 'apply subject bounds' : 'apply the effect'} to enable export.`}</small>
      <div className="download-links"><button disabled={!file || !!outputError} onClick={() => auxiliary('calibration')}>Download calibration page</button><button disabled={!file || !!outputError} onClick={() => auxiliary('assembly')}>Download assembly guide</button></div>
    </fieldset>
    {(error || (file && outputError)) && <Alert tone="error">{error || outputError}</Alert>}
    {busy && <Alert><span aria-live="polite">{status === 'reading' ? 'Reading image…' : progress}</span><button onClick={() => { token.current.current = true; if (status === 'reading') { ++readVersion.current; setStatus('canceled'); } }}>Cancel</button></Alert>}
    {status === 'canceled' && <Alert>Preparation canceled. Your image and settings are still here.</Alert>}
    {status === 'failed' && <B secondary onClick={result ? download : process}>Try again</B>}
    {status === 'ready' && pdf && <Alert tone="success">Your PDF is ready.<button onClick={() => saveBlob(pdf, `postertiler-${kind}.pdf`)}>Download again</button></Alert>}
    </section><div className="document-preview"><Preview source={shown} settings={settings} pixels={result || currentPixels || { width: 1, height: 1 }} empty={!shown} /><p className="print-hint">{life ? 'The selected subject bounds set the physical height. Image quality and print scaling still affect the final result.' : result ? 'Preview and PDF use the same processed artwork.' : 'Apply the effect to update the artwork used for export.'}</p></div></div>
    <section className="section prose"><h2>{life ? 'How to make a life-size poster' : 'How to print halftone artwork'}</h2><p>{life ? 'Choose a full-length image with the whole subject visible. Move the bounds to the head and feet, then enter the real height. Apply the selection, choose your printer paper and review the page count. The selected image is enlarged proportionally without stretching.' : 'Choose an image and effect. Larger dot spacing gives a coarser screen; dither produces black-and-white pixels. Apply your changes, choose a sheet layout and review the preview before downloading.'}</p><p>Print at Actual Size / 100%, using the same paper as the PDF. The calibration page and assembly guide are separate downloads.</p><a href="/guides/how-to-assemble-a-tiled-poster">Read the assembly guide</a> · <a href="/tools">Browse all tools</a></section>
  </main>;
}
