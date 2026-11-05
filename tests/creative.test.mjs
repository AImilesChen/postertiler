import test from 'node:test';
import assert from 'node:assert/strict';
import { cropRect, FULL_CROP, lifeSettings, ditherRgba, validateEffect, tone } from '../src/engine/creative.ts';
import { geometry, DEFAULTS } from '../src/engine/geometry.ts';
test('life-size reference bounds determine exact height without stretching', () => {
  const crop = cropRect(1200, 2000, { left: 25, right: 75, top: 10, bottom: 90 });
  assert.deepEqual(crop, { x: 300, y: 200, width: 600, height: 1600 });
  const s = lifeSettings(1800, crop), g = geometry(s);
  assert.equal(g.height, 1800); assert.equal(g.width, 675); assert.equal(g.count, 28); assert.equal(g.error, '');
  const letter = geometry(lifeSettings(1800, crop, { ...DEFAULTS, paper: 'US Letter', labels: true, margin: 6.35 }));
  assert.equal(letter.height, 1800); assert.equal(letter.width, 675); assert.equal(letter.error, '');
});
test('bounds reject reversed, empty and out-of-range selection; height is bounded', () => {
  assert.throws(() => cropRect(100, 100, { ...FULL_CROP, top: 95, bottom: 90 }));
  assert.throws(() => cropRect(100, 100, { ...FULL_CROP, right: 101 }));
  assert.throws(() => cropRect(100, 100, { ...FULL_CROP, top: NaN }));
  for (const height of [0, NaN, Infinity, 5001]) assert.throws(() => lifeSettings(height, { width: 1, height: 2 }));
});
test('dither outputs only black or white, composites transparency and conserves midtone density', () => {
  const source = new Uint8ClampedArray(64 * 64 * 4); for (let i = 0; i < source.length; i += 4) source.set([128, 128, 128, 255], i);
  const result = ditherRgba(source, 64, 64); let white = 0;
  for (let i = 0; i < result.length; i += 4) { assert.ok([0, 255].includes(result[i])); assert.equal(result[i], result[i + 1]); assert.equal(result[i + 3], 255); white += result[i] === 255 ? 1 : 0; }
  assert.ok(white / 4096 > .48 && white / 4096 < .53);
  assert.deepEqual([...ditherRgba(new Uint8ClampedArray([0,0,0,0, 0,0,0,255, 255,255,255,255]), 3, 1)], [255,255,255,255, 0,0,0,255, 255,255,255,255]);
  const reversed = ditherRgba(source, 64, 64, 1, true); assert.equal(reversed[0], 255 - result[0]);
});
test('effect settings guard work and contrast bounds', () => {
  for (const cell of [0, 1, 2.5, 101, NaN]) assert.throws(() => validateEffect({ effect: 'dots', cell, contrast: 1 }));
  assert.equal(tone(255, 3), 255); assert.equal(tone(0, 3), 0); assert.equal(tone(127.5, 3), 127.5);
});
