import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus, CornersOut, X, ImageSquare } from '@phosphor-icons/react';
import { geometry, imagePlacement, pagePlans, sizeText } from './geometry';
import { loadImage } from './export';
export default function Preview({ source, settings, empty = false, pixels = { width: 1, height: 1 }, layoutOnly = false }) {
  const canvas = useRef(), root = useRef(), opener = useRef();
  const [tab, setTab] = useState('sheets'), [zoom, setZoom] = useState(60), [full, setFull] = useState(false), [error, setError] = useState('');
  const g = geometry(settings);
  useEffect(() => {
    if (empty || g.error || tab !== 'sheets') return;
    let alive = true, image, observer;
    const draw = () => {
      const c = canvas.current; if (!c || !alive) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      const ctx = c.getContext('2d'); if (!ctx) return;
      ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
      const gap = g.count > 25 ? 3 : 8;
      const scale = Math.max(.001, Math.min((w - 36 - gap * (g.columns - 1)) / (g.columns * g.pw), (h - 32 - gap * (g.rows - 1)) / (g.rows * g.ph))) * zoom / 60;
      const ox = (w - (g.columns * g.pw * scale + gap * (g.columns - 1))) / 2;
      const oy = (h - (g.rows * g.ph * scale + gap * (g.rows - 1))) / 2;
      const placement = image ? imagePlacement(g, image.naturalWidth, image.naturalHeight, settings.placement) : null;
      for (const p of pagePlans(g)) {
        const x = ox + p.col * (g.pw * scale + gap), y = oy + p.row * (g.ph * scale + gap);
        ctx.fillStyle = '#fff'; ctx.fillRect(x, y, g.pw * scale, g.ph * scale);
        ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = .7; ctx.strokeRect(x, y, g.pw * scale, g.ph * scale);
        const left = x + g.margins.left * scale, top = y + g.margins.top * scale;
        if (placement && !layoutOnly) {
          ctx.save(); ctx.beginPath(); ctx.rect(left, top, p.width * scale, p.height * scale); ctx.clip();
          ctx.drawImage(image, left + (placement.x - p.x) * scale, top + (placement.y - p.y) * scale, placement.width * scale, placement.height * scale); ctx.restore();
        }
        if (settings.cutGuides || layoutOnly) {
          ctx.save(); ctx.strokeStyle = '#777'; ctx.lineWidth = .5; ctx.setLineDash([2, 2]);
          ctx.strokeRect(left, top, p.width * scale, p.height * scale); ctx.restore();
        }
        if (settings.labels) {
          ctx.fillStyle = '#111'; ctx.font = `${Math.max(3, 2.5 * scale)}px Arial`;
          ctx.fillText(p.label, left + scale, top + (g.printableH + 3.3) * scale);
        }
      }
    };
    (async () => {
      try {
        if (!layoutOnly && source) image = await loadImage(source);
        if (!alive) return; setError(''); draw(); observer = new ResizeObserver(draw); if (canvas.current) observer.observe(canvas.current);
      } catch { if (alive) setError('The preview could not be shown. Choose the image again.'); }
    })();
    return () => { alive = false; observer?.disconnect(); };
  }, [source, settings, zoom, tab, full, empty, layoutOnly]);
  useEffect(() => {
    if (!full) return;
    const close = e => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', close); const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    root.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', close); opener.current?.focus(); };
  }, [full]);
  const ppi = !empty && !layoutOnly && !g.error ? imagePlacement(g, pixels.width, pixels.height, settings.placement).ppi : 0;
  return <div ref={root} className={`preview-wrap ${full ? 'fullscreen' : ''}`} role={full ? 'dialog' : undefined} aria-modal={full || undefined} aria-label={full ? 'Poster preview' : undefined}>
    <div className="preview-box"><div className="preview-toolbar"><div className="tabs" role="tablist" aria-label="Preview view">
      {['original', 'sheets'].map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'original' ? 'Original' : 'Printed Sheets'}</button>)}
    </div><div className="zoom"><button className="icon-button" aria-label="Zoom out" disabled={empty} onClick={() => setZoom(Math.max(20, zoom - 10))}><Minus size={18} /></button><button className="fit-zoom" aria-label="Fit preview" onClick={() => setZoom(60)}>{zoom}%</button><button className="icon-button" aria-label="Zoom in" disabled={empty} onClick={() => setZoom(Math.min(140, zoom + 10))}><Plus size={18} /></button><button ref={opener} className="icon-button" aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={() => setFull(!full)}>{full ? <X size={18} /> : <CornersOut size={18} />}</button></div></div>
    <div className="preview-canvas">{empty ? <div className="empty-preview"><ImageSquare size={50} weight="thin" /><h3>Your poster preview</h3><p>Choose an image to see your poster here.</p></div> : g.error || error ? <p role="alert">{g.error || error}</p> : tab === 'original' ? layoutOnly ? <p>Choose an image in the poster maker to see its placement.</p> : <img className="original-image" src={source} alt="Original selected image" /> : <canvas ref={canvas} role="img" aria-label={`Poster preview: ${g.columns} columns by ${g.rows} rows. Finished size ${sizeText(g, settings.unit)}.`} />}</div>
    <div className="preview-summary"><span>{empty ? 'Your poster preview' : `${g.columns} × ${g.rows} sheets`}</span><span>{!empty && !g.error && sizeText(g, settings.unit)}</span></div></div>
    <p className="print-hint">Print at Actual Size / 100%. Turn off Fit to page.</p>
    {g.framed && <p className="print-hint">Framed Grid: mount trimmed panels with {g.gap} mm gaps. Finished dimensions include those gaps; image strips in the gaps are not printed.</p>}
    {ppi > 0 && <p className="print-hint">Estimated resolution: {Math.round(ppi)} PPI · Source quality and viewing distance also matter.{ppi < 100 && ' This image may look soft at this size.'}</p>}
  </div>;
}
