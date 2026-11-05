/// <reference lib="webworker" />
import { inspectFile, validatePixels } from './image.ts';
import { cropRect, validateEffect, ditherRgba, averageCell, tone, type EffectOptions } from './creative.ts';
const worker = self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage = async ({ data }) => {
  let bitmap: ImageBitmap | undefined;
  try {
    await inspectFile(data.blob); bitmap = await createImageBitmap(data.blob, { imageOrientation: 'from-image' });
    validatePixels(bitmap.width, bitmap.height);
    const rect = cropRect(bitmap.width, bitmap.height, data.crop);
    const source = new OffscreenCanvas(rect.width, rect.height), ctx = source.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Image processing is unavailable.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height); bitmap.close(); bitmap = undefined;
    if (data.options) {
      const o = data.options as EffectOptions; validateEffect(o);
      const pixels = ctx.getImageData(0, 0, rect.width, rect.height);
      if (o.effect === 'dither') {
        const output = ditherRgba(pixels.data, rect.width, rect.height, o.contrast, o.invert,
          ratio => worker.postMessage({ type: 'progress', ratio }));
        ctx.putImageData(new ImageData(output, rect.width, rect.height), 0, 0);
      } else {
        const w = rect.width, h = rect.height, cell = o.cell;
        if (Math.ceil(w / cell) * Math.ceil(h / cell) * (o.effect === 'cmyk' ? 6 : 1) > 600000)
          throw new Error('Increase dot spacing or choose a smaller image to stay below 600,000 screen dots.');
        ctx.fillStyle = o.invert ? '#000' : '#fff'; ctx.fillRect(0, 0, w, h);
        const channels = o.effect === 'cmyk' ? [
          { angle: 15, colour: '#00ffff', index: 0 }, { angle: 75, colour: '#ff00ff', index: 1 },
          { angle: 0, colour: '#ffff00', index: 2 }, { angle: 45, colour: '#000000', index: 3 },
        ] : [{ angle: 0, colour: '#000000', index: -1 }];
        ctx.globalCompositeOperation = o.effect === 'cmyk' ? 'multiply' : 'source-over';
        for (const channel of channels) {
          const angle = channel.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle), radius = Math.hypot(w, h) / 2;
          const extent = channel.angle ? radius : Math.max(w, h) / 2;
          for (let gy = -extent; gy <= extent; gy += cell) {
            for (let gx = -extent; gx <= extent; gx += cell) {
              const x = w / 2 + gx * cos - gy * sin, y = h / 2 + gx * sin + gy * cos;
              if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
              const rgb = averageCell(pixels.data, w, h, x, y, cell).map(v => tone(v, o.contrast));
              let ink = 1 - (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255;
              if (channel.index >= 0) {
                const k = 1 - Math.max(...rgb) / 255;
                ink = channel.index === 3 ? k : k >= 1 ? 0 : (1 - rgb[channel.index] / 255 - k) / (1 - k);
              }
              if (o.invert) ink = 1 - ink;
              if (ink <= .001) continue;
              ctx.fillStyle = channel.index < 0 && o.colour ? `rgb(${rgb.map(Math.round).join(',')})` : o.invert && channel.index < 0 ? '#fff' : channel.colour;
              ctx.beginPath(); ctx.arc(x, y, cell * .71 * Math.sqrt(ink), 0, Math.PI * 2); ctx.fill();
            }
          }
          worker.postMessage({ type: 'progress', ratio: (channels.indexOf(channel) + 1) / channels.length });
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    const blob = await source.convertToBlob({ type: 'image/png' }); source.width = source.height = 1;
    worker.postMessage({ type: 'complete', blob, width: rect.width, height: rect.height });
  } catch (error) {
    const known = error instanceof Error && /^(Keep |Select a larger|Choose |Increase dot|Enter )/.test(error.message);
    worker.postMessage({ type: 'error', message: known ? (error as Error).message : 'This image could not be processed. Try a smaller image or wider dot spacing.' });
  } finally { bitmap?.close(); }
};
