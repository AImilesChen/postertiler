import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {PDFDocument,PDFArray,PDFName} from 'pdf-lib';
import {guides} from '../src/data.js';
import {guideMeta,printProblems,printChecklist} from '../src/guide-content.js';
import {guideHelp} from '../src/guide-help.js';
import {searchGuides} from '../src/guide-search.js';
import {checklistPdf} from '../src/engine/pdf.ts';
import {DEFAULTS} from '../src/engine/geometry.ts';

test('problem-based searches rank the intended answer first, including the former scale failure',()=>{
 for(const [query,slug] of [['scale','how-to-print-a-pdf-at-actual-size'],['100%','how-to-print-a-pdf-at-actual-size'],['blurry','image-resolution-for-large-posters'],['white border','printer-margins-and-overlap'],['fit fill','fit-vs-fill-poster'],['letter landscape','paper-size-and-orientation']]){
  assert.equal(searchGuides(guides,query,guideMeta)[0]?.slug,slug,query);
 }
});
test('guide search normalises punctuation and whitespace, matches body content and has a useful empty state',()=>{
 assert.deepEqual(searchGuides(guides,'  ',guideMeta),guides);
 assert.equal(searchGuides(guides,'ACTUAL-SIZE',guideMeta)[0].slug,'how-to-print-a-pdf-at-actual-size');
 assert.ok(searchGuides(guides,'physical ruler',guideMeta).some(g=>g.slug==='how-to-print-a-pdf-at-actual-size'));
 assert.deepEqual(searchGuides(guides,'no-such-guide-xyz123',guideMeta),[]);
 assert.ok(searchGuides(guides,'a'.repeat(10000),guideMeta).length<=guides.length);
});
test('every guide has complete help, valid figures and resolvable related reading',async()=>{
 assert.equal(guides.length,8);assert.equal(new Set(guides.map(g=>g.slug)).size,8);
 for(const guide of guides){
  const meta=guideMeta[guide.slug],help=guideHelp[guide.slug];assert.ok(meta&&help&&help.faq.length&&help.mistakes.length);
  assert.equal(meta.details.length,guide.steps.length);
  for(const slug of meta.related)assert.ok(guides.some(g=>g.slug===slug),slug);
  if(meta.visual){assert.ok(meta.visual.step>=0&&meta.visual.step<guide.steps.length);await readFile('public'+meta.visual.src);}
 }
 for(const problem of printProblems)assert.ok(guides.some(g=>g.slug===problem.slug));
 assert.match(guideHelp['image-resolution-for-large-posters'].faq[1][1],/AI Image Upscaler/);
 assert.ok(!guideHelp['image-resolution-for-large-posters'].faq[1][1].includes('The V1 tool'));
});
test('print checklist retains all eight checks and the selected physical paper in both orientations',async()=>{
 for(const [paper,[w,h]] of Object.entries({'A4':[210,297],'US Letter':[215.9,279.4],'A3':[297,420]})){
  for(const orientation of ['Portrait','Landscape']){
   const pdf=await PDFDocument.load(await checklistPdf({...DEFAULTS,paper,orientation},printChecklist));assert.equal(pdf.getPageCount(),1);
   const page=pdf.getPage(0),[pw,ph]=orientation==='Portrait'?[w,h]:[h,w];
   assert.ok(Math.abs(page.getWidth()-pw*72/25.4)<.01);assert.ok(Math.abs(page.getHeight()-ph*72/25.4)<.01);
   const contents=page.node.Contents(),refs=contents instanceof PDFArray?contents.asArray():[contents];
   const operators=refs.map(ref=>inflateSync(pdf.context.lookup(ref).contents).toString()).join('');
   for(let i=0;i<printChecklist.length;i++)assert.ok(operators.includes(Buffer.from(`${i+1}. `+printChecklist[i].split(' ').slice(0,2).join(' ')).toString('hex').toUpperCase()));
  }
 }
 await assert.rejects(()=>checklistPdf(DEFAULTS,[]));
});
