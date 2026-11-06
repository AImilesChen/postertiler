import { inspectFile, PROCESSED_IMAGE_BYTES } from './engine/image.ts';
export { inspectFile };
export function loadImage(src) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Image could not be read.')); image.src = src; });
}
export function saveBlob(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function fallbackJpeg(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url), c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('Image processing unavailable.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(image, 0, 0);
    const jpeg = await new Promise(resolve => c.toBlob(resolve, 'image/jpeg', .96)); c.width = c.height = 1;
    if (!jpeg) throw new Error('Image processing unavailable.'); return jpeg.arrayBuffer();
  } finally { URL.revokeObjectURL(url); }
}
export async function makePoster(source, settings, onProgress, cancel, preservePng = false) {
  const blob = await (await fetch(source)).blob(); await inspectFile(blob, preservePng ? PROCESSED_IMAGE_BYTES : undefined);
  if (cancel.current) throw new Error('canceled');
  if (typeof Worker === 'undefined') throw new Error('Use a current browser that supports background PDF export.');
  const jpeg = !preservePng && typeof OffscreenCanvas === 'undefined' ? await fallbackJpeg(blob) : null;
  if (cancel.current) throw new Error('canceled');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./engine/export.worker.ts', import.meta.url), { type: 'module' });
    const finish = (value, failed = false) => { clearInterval(timer); worker.terminate(); failed ? reject(value) : resolve(value); };
    const timer = setInterval(() => { if (cancel.current) finish(new Error('canceled'), true); }, 25);
    worker.onerror = () => finish(new Error('The PDF could not be prepared. Try a smaller image.'), true);
    worker.onmessage = ({ data }) => {
      if (cancel.current) { finish(new Error('canceled'), true); return; }
      if (data.type === 'progress') onProgress(data.page, data.total);
      if (data.type === 'complete') finish(data.bytes);
      if (data.type === 'error') finish(new Error(data.message), true);
    };
    worker.postMessage({ blob, jpeg, settings, preservePng }, jpeg ? [jpeg] : []);
  });
}
export async function calibration(settings) { const { calibrationPdf } = await import('./engine/pdf.ts'); saveBlob(await calibrationPdf(settings), 'postertiler-calibration.pdf'); }
export async function assembly(settings) { const { assemblyPdf } = await import('./engine/pdf.ts'); saveBlob(await assemblyPdf(settings), 'postertiler-assembly-guide.pdf'); }
