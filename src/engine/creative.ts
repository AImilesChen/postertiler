import { DEFAULTS, type Settings } from './geometry.ts';

export type Crop = { left: number; top: number; right: number; bottom: number };
export const FULL_CROP: Crop = { left: 0, top: 0, right: 100, bottom: 100 };
export function cropRect(width: number, height: number, crop: Crop) {
  const { left, top, right, bottom } = crop;
  if (![left, top, right, bottom].every(Number.isFinite) || left < 0 || top < 0 || right > 100 || bottom > 100 || right <= left || bottom <= top)
    throw new Error('Keep the bottom below the top and the right edge beyond the left edge, within 0–100%.');
  const x = Math.floor(width * left / 100), y = Math.floor(height * top / 100);
  const w = Math.ceil(width * right / 100) - x, h = Math.ceil(height * bottom / 100) - y;
  if (w < 2 || h < 2) throw new Error('Select a larger part of the image.');
  return { x, y, width: w, height: h };
}
export function lifeSettings(height: number, pixels: { width: number; height: number }, paper: Settings = DEFAULTS): Settings {
  if (!Number.isFinite(height) || height < 10 || height > 5000) throw new Error('Enter a finished height between 1 and 500 cm.');
  if (!(pixels.width > 0 && pixels.height > 0)) throw new Error('Choose an image first.');
  return { ...paper, mode: 'exact', width: height * pixels.width / pixels.height, height, imageRatio: pixels.width / pixels.height, placement: 'fit', locked: true, layoutMode: 'continuous' };
}
export type Effect = 'dots' | 'dither' | 'cmyk';
export type EffectOptions = { effect: Effect; cell: number; colour: boolean; contrast: number; invert: boolean };
export function validateEffect(o: EffectOptions) {
  if (!['dots', 'dither', 'cmyk'].includes(o.effect) || !Number.isInteger(o.cell) || o.cell < 2 || o.cell > 100 || !Number.isFinite(o.contrast) || o.contrast < .25 || o.contrast > 3)
    throw new Error('Choose a supported effect, dot spacing from 2 to 100 pixels and contrast from 0.25 to 3.');
}
export const tone = (value: number, contrast: number) => Math.min(255, Math.max(0, (value - 127.5) * contrast + 127.5));
// Floyd–Steinberg error diffusion, with alternating scan direction to reduce directional bias.
export function ditherRgba(rgba: Uint8ClampedArray, width: number, height: number, contrast = 1, invert = false, progress = (_: number) => {}) {
  if (rgba.length !== width * height * 4 || width < 1 || height < 1) throw new Error('Invalid pixel buffer.');
  const out = new Uint8ClampedArray(rgba.length);
  let errors = new Float32Array(width + 2), next = new Float32Array(width + 2);
  for (let y = 0; y < height; y++) {
    const dir = y % 2 ? -1 : 1;
    for (let n = 0; n < width; n++) {
      const x = dir === 1 ? n : width - 1 - n, i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      const grey = (.2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2]) * a + 255 * (1 - a);
      const old = tone(grey, contrast) + errors[x + 1], q = old < 127.5 ? 0 : 255, e = old - q;
      const v = invert ? 255 - q : q;
      out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
      errors[x + 1 + dir] += e * 7 / 16;
      next[x + 1 - dir] += e * 3 / 16; next[x + 1] += e * 5 / 16; next[x + 1 + dir] += e / 16;
    }
    [errors, next] = [next, errors]; next.fill(0);
    if (y % 64 === 0) progress(y / height);
  }
  return out;
}
export function averageCell(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, cell: number) {
  let r = 0, g = 0, b = 0, count = 0;
  const left = Math.max(0, Math.floor(x - cell / 2)), top = Math.max(0, Math.floor(y - cell / 2));
  const right = Math.min(width, Math.ceil(x + cell / 2)), bottom = Math.min(height, Math.ceil(y + cell / 2));
  // Bounded sampling keeps a large cell responsive; image is already composited on white.
  const step = Math.max(1, Math.floor(cell / 8));
  for (let yy = top; yy < bottom; yy += step) for (let xx = left; xx < right; xx += step) {
    const i = (yy * width + xx) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
  }
  return count ? [r / count, g / count, b / count] : [255, 255, 255];
}
