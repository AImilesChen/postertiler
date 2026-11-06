import React, { useEffect, useId, useRef, useState } from 'react';
import { Minus, Plus, CornersOut, X, ImageSquare, PersonSimple } from '@phosphor-icons/react';
import { geometry, imagePlacement, sizeText, MM_PER_UNIT } from './geometry';
import { previewPlan } from './engine/preview.ts';
import { sizeReferenceScene } from './engine/size-reference.ts';
import SizeReference from './SizeReference';
import { loadImage } from './export';
import './preview.css';

export default function Preview({ source, settings, empty = false, pixels = { width: 1, height: 1 }, layoutOnly = false, pageLimit, onSourceError, withSizeReference = false }) {
  const root = useRef(), stage = useRef(), opener = useRef(), tabs = useRef([]);
  const [tab, setTab] = useState(layoutOnly ? 'sheets' : 'original');
  const [zoom, setZoom] = useState(100), [full, setFull] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [dimensions, setDimensions] = useState(null), [failedSource, setFailedSource] = useState(null);
  const [viewport, setViewport] = useState({ width: 600, height: 588 });
  const id = useId().replace(/:/g, ''), g = geometry(settings, pageLimit);
  const ready = layoutOnly || (source && dimensions?.source === source);
  const error = source && failedSource === source ? 'The preview could not be shown. Choose the image again.' : '';
  useEffect(() => {
    let alive = true;
    if (source && !layoutOnly) loadImage(source).then(image => {
      if (alive) { setDimensions({ source, width: image.naturalWidth, height: image.naturalHeight }); setFailedSource(null); }
    }).catch(() => { if (alive) { setFailedSource(source); onSourceError?.(true); } });
    return () => { alive = false; };
  }, [source, layoutOnly, onSourceError]);
  useEffect(() => {
    const node = stage.current;
    const measure = () => { if (node) setViewport({ width: node.clientWidth, height: node.clientHeight }); };
    measure(); const observer = new ResizeObserver(measure); if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!full) return;
    const close = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setFull(false); }
      if (e.key === 'Tab') {
        e.stopPropagation();
        const controls = [...root.current.querySelectorAll('button:not(:disabled):not([tabindex="-1"]),[role="tabpanel"]')];
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', close, true);
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    root.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', close, true); opener.current?.focus(); };
  }, [full]);
  useEffect(() => { if (stage.current) { stage.current.scrollLeft = 0; stage.current.scrollTop = 0; } }, [tab, source]);

  const sourcePixels = pixels.width > 1 && pixels.height > 1 ? pixels : dimensions?.source === source ? dimensions : pixels;
  const plan = !g.error ? previewPlan(g, sourcePixels, settings.placement) : null;
  const sheets = tab === 'sheets';
  const reference = withSizeReference && showReference && !sheets && !empty && !layoutOnly && plan;
  const scene = reference ? sizeReferenceScene(g.width,g.height) : null;
  const bounds = sheets ? plan?.paperBounds : scene?.bounds || plan?.canvas;
  const axisBounds = sheets ? plan?.paperBounds : plan?.canvas;
  const heightLabel = !g.error ? `${(g.height/MM_PER_UNIT[settings.unit]).toFixed(settings.unit==='mm'?0:1)} ${settings.unit}` : '';
  const compactReference = reference && viewport.width < 420, padding = compactReference ? 12 : 24;
  const leftPixels=compactReference?18:28, rightPixels=reference?(compactReference?50:68):10;
  // Zoom is relative to the fitted view, never a physical print-scale setting.
  const fitScale = bounds ? Math.max(.001, Math.min((viewport.width - leftPixels-rightPixels-2*padding) / bounds.width, (viewport.height - 24-(reference?38:10)-2*padding) / bounds.height)) : 1;
  const factor = zoom / 100, scale = fitScale * factor;
  const left = leftPixels / fitScale, top = 24 / fitScale, right = rightPixels / fitScale, bottom = (reference?38:10) / fitScale;
  const frameW = bounds ? (bounds.width + left + right) * scale : 0;
  const frameH = bounds ? (bounds.height + top + bottom) * scale : 0;
  const viewBox = bounds ? `${bounds.x - left} ${bounds.y - top} ${bounds.width + left + right} ${bounds.height + top + bottom}` : '';
  const ppi = !empty && !layoutOnly && !g.error && pixels.width > 0 ? imagePlacement(g, pixels.width, pixels.height, settings.placement).ppi : 0;
  const zoomTo = value => setZoom(Math.max(25, Math.min(300, value)));
  const tabKeys = (e, index) => {
    let next;
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) next = 1 - index;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = 1;
    if (next !== undefined) { e.preventDefault(); setTab(next ? 'sheets' : 'original'); tabs.current[next]?.focus(); }
  };
  return <div ref={root} className={`preview-wrap ${full ? 'fullscreen' : ''}`} data-clarity-mask="true" role={full ? 'dialog' : undefined} aria-modal={full || undefined} data-preview-dialog={full || undefined} aria-label={full ? 'Poster preview' : undefined}>
    <div className="preview-box"><div className="preview-toolbar"><div className="tabs" role="tablist" aria-label="Preview view">
      {['original', 'sheets'].map((value, index) => <button key={value} ref={node => { tabs.current[index] = node; }} id={`${id}-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1} onKeyDown={e => tabKeys(e, index)} onClick={() => setTab(value)}>{value === 'original' ? 'Original' : 'Printed Sheets'}</button>)}
    </div><div className="zoom"><button className="icon-button" aria-label="Zoom out" disabled={empty || !!g.error || zoom <= 25} onClick={() => zoomTo(zoom - 25)}><Minus size={18} /></button><button className="fit-zoom" aria-label="Fit preview" title="Reset to fit the preview" disabled={empty || !!g.error} onClick={() => setZoom(100)}>{zoom}%</button><button className="icon-button" aria-label="Zoom in" disabled={empty || !!g.error || zoom >= 300} onClick={() => zoomTo(zoom + 25)}><Plus size={18} /></button><button ref={opener} className="icon-button" aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={() => setFull(!full)}>{full ? <X size={18} /> : <CornersOut size={18} />}</button></div></div>
    {withSizeReference&&!sheets&&!empty&&!layoutOnly&&!g.error&&<div className="preview-reference-tools"><button aria-label="Size reference" aria-pressed={showReference} title="Compare the finished poster with a 180 cm figure" onClick={()=>{setShowReference(value=>!value);setZoom(100);}}><PersonSimple size={18} aria-hidden="true"/><span>Size reference</span><span className="reference-state">{showReference?'On':'Off'}</span></button><span>Poster height <strong>{heightLabel}</strong></span></div>}
    <div ref={stage} className="preview-canvas poster-preview-stage" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} tabIndex={0} aria-label="Poster preview; scroll to inspect when zoomed">
      {empty ? <div className="empty-preview"><ImageSquare size={50} weight="thin" /><h3>Your poster preview</h3><p>Choose an image to see your poster here.</p></div> : g.error || error ? <p role="alert">{g.error || error}</p> : !ready ? <p role="status">Preparing preview…</p> : !sheets && layoutOnly ? <p>Choose an image in the poster maker to see its placement.</p> : <div className="preview-scroll-space" style={{ width: frameW + 2*padding, height: frameH + 2*padding, padding }}>
        <div className="preview-artboard" data-view={tab} style={{ width: frameW, height: frameH }}>
          {!sheets && <div className="poster-image-surface" style={{ left: (left-bounds.x) * scale, top: (top-bounds.y) * scale, width: g.width * scale, height: g.height * scale }}>
            <img className="original-image" src={source} alt="Original selected image" draggable="false" style={{ left: plan.placement.x * scale, top: plan.placement.y * scale, width: plan.placement.width * scale, height: plan.placement.height * scale }} />
          </div>}
          <svg className="poster-plan-overlay" viewBox={viewBox} role="img" aria-label={`${sheets ? 'Sheet layout' : 'Assembled poster with page divisions'}: ${g.columns} columns by ${g.rows} rows. Finished size ${sizeText(g, settings.unit)}.${reference?' Compared with a 180 cm reference figure.':''}`}>
            <defs><pattern id={`${id}-overlap`} width={6 / fitScale} height={6 / fitScale} patternUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="#b6ccdf" /><path d={`M0 ${6 / fitScale}L${6 / fitScale} 0`} stroke="#698aa5" strokeWidth={.7 / fitScale} /></pattern></defs>
            {reference&&<SizeReference scene={scene} posterWidth={g.width} posterHeight={g.height} fitScale={fitScale} heightLabel={heightLabel}/>}
            {sheets ? <>
              <g className="preview-paper-shapes" fill="#fff">{plan.pages.map(page => <rect key={page.label} {...page.paper} />)}</g>
              <g className="preview-image-areas" fill="#d4e3ef">{plan.pages.map(page => page.image && <rect key={page.label} {...page.image} />)}</g>
              <g className="preview-overlap-areas" fill={`url(#${id}-overlap)`}>{plan.overlaps.map((rect, index) => <rect key={index} {...rect} />)}</g>
              <g className="preview-paper-outlines" fill="none" stroke="#8a9ba9" strokeWidth={.7 / fitScale}>{plan.pages.map(page => <rect key={page.label} {...page.paper} />)}</g>
              {settings.cutGuides && <g fill="none" stroke="#71889b" strokeDasharray={`${3 / fitScale} ${3 / fitScale}`} strokeWidth={.6 / fitScale}>{plan.pages.map(page => <rect key={page.label} x={page.x} y={page.y} width={page.width} height={page.height} />)}</g>}
              <rect className="preview-finished-edge" {...plan.canvas} fill="none" stroke="#b91c2b" strokeWidth={1.7 / fitScale} />
            </> : <>
              <g className="preview-panel-gaps" fill="#f8f8f8">{plan.gaps.map((rect, index) => <rect key={index} {...rect} />)}</g>
              {!g.framed && <g className="preview-page-divisions" fill="none">{[...plan.columns.slice(1).map(column => <path key={`c-${column.label}`} d={`M${column.start} 0V${g.height}`} />), ...plan.rows.slice(1).map(row => <path key={`r-${row.label}`} d={`M0 ${row.start}H${g.width}`} />)].map(line => <g key={line.key}><g stroke="#fff" strokeOpacity=".7" strokeWidth={1.7 / fitScale}>{line}</g><g stroke="#27313a" strokeOpacity=".5" strokeWidth={.55 / fitScale}>{line}</g></g>)}</g>}
              <rect {...plan.canvas} fill="none" stroke="#222" strokeOpacity=".35" strokeWidth={.7 / fitScale} />
            </>}
            <g className="preview-axis-labels" fill="#46545e" fontFamily="Arial, sans-serif" fontSize={11 / fitScale} textAnchor="middle">
              {plan.columns.map(column => <text key={column.label} x={column.center} y={axisBounds.y - 9 / fitScale}>{column.label}</text>)}
              {plan.rows.map(row => <text key={row.label} x={axisBounds.x - 14 / fitScale} y={row.center} dominantBaseline="middle">{row.label}</text>)}
            </g>
          </svg>
        </div>
      </div>}
    </div>
    {reference&&<p className="preview-reference-note">180 cm reference figure. Both are drawn to the same scale; the figure is not included in your PDF.</p>}
    {!empty && !g.error && sheets && <ul className="preview-legend" aria-label="Sheet layout legend"><li><i className="legend-sheet" />Sheet</li><li><i className="legend-image" />Image area</li><li><i className="legend-overlap" />Overlap</li><li><i className="legend-edge" />Finished poster edge</li></ul>}
    <div className="preview-summary"><span>{empty ? 'Your poster preview' : `${g.columns} × ${g.rows} sheets`}</span><span>{!empty && !g.error && sizeText(g, settings.unit)}</span></div></div>
    {!empty && !g.error && <p className="preview-explanation">{sheets ? 'Assembly map: sheets are shown in their joining positions. Trim or cover printer margins; hatched areas repeat on adjacent sheets.' : g.framed ? 'Finished panel arrangement. The visible gaps are intentional mounting spaces.' : 'Finished poster with page divisions. Printer margins are removed during assembly; the lines are not blank gaps.'}</p>}
    <p className="print-hint">Print at Actual Size / 100%. Turn off Fit to page. Preview zoom does not change the PDF.</p>
    {zoom > 100 && !empty && <p className="print-hint">Scroll inside the preview to inspect the enlarged poster. Click the percentage to fit it again.</p>}
    {g.framed && <p className="print-hint">Framed Grid: mount trimmed panels with {g.gap} mm gaps. Finished dimensions include those gaps; image strips in the gaps are not printed.</p>}
    {ppi > 0 && <p className="print-hint">Estimated resolution: {Math.round(ppi)} PPI · Source quality and viewing distance also matter.{ppi < 100 && ' This image may look soft at this size.'}</p>}
  </div>;
}
