import { samples } from './data.js';
import { DEFAULTS } from './geometry.js';

// Only bundled artwork and existing effects can be initialized from a URL.
export function creativeExample(search, kind) {
  const query = new URLSearchParams(search);
  const id = query.get('sample');
  const sample = samples.find(item => item.id === id);
  const effect = ['dots', 'dither', 'cmyk'].includes(query.get('effect')) ? query.get('effect') : 'dots';
  return { sample: kind === 'life-size' ? (sample?.id === 'portrait' ? sample : null) : sample, effect };
}

export const sampleSettings = sample => ({ ...DEFAULTS, columns: sample.columns, rows: sample.rows,
  imageRatio: sample.width / sample.height });
