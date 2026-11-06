import { AI_PACKS, validateSpec } from '../server/ai/contract.mjs';

// Displayed rates come from the same quotes that validate a paid task.
const quote = (quality, size) => validateSpec({ kind: 'generate', quality, size, prompt: 'Pricing example' }).credits;
export const AI_USAGE = Object.freeze([
  { id: 'standard', label: 'Enhancement or standard image', detail: 'Enhance an image, or generate / edit at standard quality.', credits: quote('medium', 'portrait') },
  { id: 'high', label: 'High-quality image', detail: 'Generate or edit at high quality.', credits: quote('high', 'portrait') },
  { id: '4k', label: '4K high-quality image', detail: 'Generate or edit a 3840 × 2160 landscape image.', credits: quote('high', '4k') },
]);
export const aiTaskCount = (credits, rate) => Math.floor(credits / rate);
export const AI_STARTER = AI_PACKS.ai40;
