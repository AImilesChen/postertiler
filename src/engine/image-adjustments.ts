export const COLOUR_DEFAULTS = { brightness: 100, contrast: 100, saturation: 100, warmth: 0, hue: 0 };
export const TREATMENT_DEFAULTS = { ...COLOUR_DEFAULTS, effect: 'original', cell: 12, colour: false, invert: false };
export type ColourAdjustments = typeof COLOUR_DEFAULTS;
export const IMAGE_LOOKS = ['original', 'dots', 'dither', 'cmyk'] as const;
export function validateColour(a: ColourAdjustments) {
  const ranges = { brightness: [0, 200], contrast: [0, 200], saturation: [0, 200], warmth: [-100, 100], hue: [-180, 180] };
  for (const key of Object.keys(ranges) as (keyof ColourAdjustments)[]) {
    const [min, max] = ranges[key];
    if (!Number.isFinite(a?.[key]) || a[key] < min || a[key] > max)
      throw new Error('Choose brightness, contrast and saturation from 0 to 200%, warmth from -100 to 100, and hue from -180 to 180 degrees.');
  }
}
export function isOriginalTreatment(a: typeof TREATMENT_DEFAULTS) {
  return a.effect === 'original' && (Object.keys(COLOUR_DEFAULTS) as (keyof ColourAdjustments)[]).every(key => a[key] === COLOUR_DEFAULTS[key]);
}
export function lookFromQuery(search: string) {
  const look = new URLSearchParams(search).get('look');
  return IMAGE_LOOKS.find(value => value === look) || null;
}

// Work in source sRGB pixels, retaining dimensions and alpha. Colour adjustments
// precede artistic screens; preview and PDF consume this one rendered bitmap.
export function adjustRgba(input: Uint8ClampedArray, a: ColourAdjustments, progress = (_: number) => {}) {
  validateColour(a);
  if (input.length % 4) throw new Error('Choose a valid RGBA pixel buffer.');
  const out = new Uint8ClampedArray(input.length);
  const brightness = a.brightness / 100, contrast = a.contrast / 100, saturation = a.saturation / 100;
  const angle = a.hue * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const hue = [
    .213 + .787*c - .213*s, .715 - .715*c - .715*s, .072 - .072*c + .928*s,
    .213 - .213*c + .143*s, .715 + .285*c + .140*s, .072 - .072*c - .283*s,
    .213 - .213*c - .787*s, .715 - .715*c + .715*s, .072 + .928*c + .072*s,
  ];
  for (let i = 0; i < input.length; i += 4) {
    let r = (input[i] * brightness - 127.5) * contrast + 127.5 + a.warmth * .4;
    let g = (input[i+1] * brightness - 127.5) * contrast + 127.5 + a.warmth * .05;
    let b = (input[i+2] * brightness - 127.5) * contrast + 127.5 - a.warmth * .4;
    const grey = .2126*r + .7152*g + .0722*b;
    r = grey + (r-grey)*saturation; g = grey + (g-grey)*saturation; b = grey + (b-grey)*saturation;
    if (a.hue) {
      out[i] = hue[0]*r + hue[1]*g + hue[2]*b;
      out[i+1] = hue[3]*r + hue[4]*g + hue[5]*b;
      out[i+2] = hue[6]*r + hue[7]*g + hue[8]*b;
    } else { out[i] = r; out[i+1] = g; out[i+2] = b; }
    out[i+3] = input[i+3];
    if (i % 262144 === 0) progress(i / input.length);
  }
  progress(1); return out;
}
