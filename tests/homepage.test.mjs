import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,access } from 'node:fs/promises';
import { creativeExample,sampleSettings } from '../src/example-links.js';
import { samples } from '../src/data.js';
import { geometry } from '../src/engine/geometry.ts';
import { lifeSettings } from '../src/engine/creative.ts';
import { PDFDocument } from 'pdf-lib';
import { inspectFile } from '../src/engine/image.ts';
import { featuredPosters,posterScenarios } from '../src/homepage-artwork.js';

test('creative deep links allow only bundled images and supported effects',()=>{
 for(const effect of ['dots','dither','cmyk']){
  const result=creativeExample(`?sample=geometry&effect=${effect}`,'halftone');
  assert.equal(result.sample.id,'geometry');assert.equal(result.effect,effect);
 }
 for(const sample of ['https://example.com/private.png','../../private','__proto__','unknown']){
  assert.equal(creativeExample(`?sample=${encodeURIComponent(sample)}&effect=fetch`,'halftone').sample,undefined);
 }
 assert.equal(creativeExample('?sample=geometry','life-size').sample,null);
 assert.equal(creativeExample('?sample=portrait','life-size').sample.id,'portrait');
 assert.equal(creativeExample('?sample=geometry&effect=constructor','halftone').effect,'dots');
});

test('sample presets match bundled image dimensions and produce valid printable layouts',async()=>{
 for(const item of samples){
  const bytes=await readFile(`public/assets/images/${item.image}`),info=await inspectFile(new Blob([bytes]));
  assert.equal(info.width,item.width,item.id);assert.equal(info.height,item.height,item.id);
  const g=geometry(sampleSettings(item));assert.equal(g.error,'',item.id);assert.equal(g.count,item.rows*item.columns);
 }
 const portrait=samples.find(s=>s.id==='portrait'),g=geometry(lifeSettings(1800,portrait));
 assert.equal(g.height,1800);assert.equal(g.count,49);assert.equal(g.error,'');
 const classroom=samples.find(s=>s.id==='classroom');assert.equal(geometry(sampleSettings(classroom)).count,6);
});

test('featured cases and use cases have nine different printable artworks with matching links',async()=>{
 const slots=[...featuredPosters,...posterScenarios];assert.equal(slots.length,9);assert.equal(new Set(slots.map(s=>s.id)).size,9);
 for(const slot of slots){
  const item=samples.find(s=>s.id===slot.id);assert.ok(item?.style);await access(`public/assets/images/${item.image}`);
  if(slot.life)assert.equal(creativeExample(`?sample=${slot.id}`,'life-size').sample.id,slot.id);
  else assert.equal(geometry(sampleSettings(item)).count,4);
  const prefix=featuredPosters.some(s=>s.id===slot.id)?'scene':'art';
  await access(`public/assets/homepage/${prefix}-${slot.id}-960.webp`);
 }
 assert.equal(creativeExample('?sample=jade-mountains','life-size').sample,null);
});

test('homepage calibration retains real paper size and effect previews share source dimensions',async()=>{
 const calibration=await PDFDocument.load(await readFile('public/assets/homepage/calibration-a4.pdf'));
 assert.equal(calibration.getPageCount(),1);assert.ok(Math.abs(calibration.getPage(0).getWidth()*25.4/72-210)<.01);
 const record=JSON.parse(await readFile('public/assets/homepage/render-record.json','utf8'));
 assert.equal(record.effects.length,4);assert.equal(new Set(record.effects.map(s=>`${s.width}x${s.height}`)).size,1);
 for(const row of record.effects)await access(`public/assets/homepage/look-${row.effect}-800.webp`);
});
