import test from 'node:test';
import assert from 'node:assert/strict';
import { aiTaskFromSearch, aiTaskUrl,aiToolUrl,aiPublicTask } from '../src/ai-navigation.js';
import { safeReturnTo } from '../server/auth.mjs';

test('AI entry intents survive refresh and exact OAuth returns; missing intent selects enhancement',()=>{
  assert.equal(aiTaskFromSearch(''),'upscale');
  for(const task of ['upscale','generate','edit']) {
    const destination=aiTaskUrl(task);
    assert.equal(aiTaskFromSearch(new URL(destination,'https://postertiler.com').search),task);
    assert.equal(safeReturnTo(destination),destination);
  }
  for(const task of ['__proto__','constructor','https://attacker.invalid/','unknown'])assert.equal(aiTaskUrl(task),'/account/ai?task=upscale');
});

test('public AI modes have exact crawlable paths while account return intents stay private',()=>{
 for(const [task,path] of [['upscale','/tools/ai-image-upscaler'],['generate','/tools/ai-image-generator'],['edit','/tools/ai-image-editor']]){
  assert.equal(aiToolUrl(task),path);assert.equal(aiPublicTask(path),task);assert.equal(safeReturnTo(path),path);
  assert.equal(aiTaskUrl(task),'/account/ai?task='+task);
  for(const bad of [path+'?next=https://attacker.invalid',path+'#private','https://attacker.invalid'+path])assert.equal(safeReturnTo(bad),'/account');
 }
 assert.equal(aiToolUrl('edit'),'/tools/ai-image-editor');
 assert.equal(aiPublicTask('/tools/unknown'),undefined);
});
test('AI payment returns only permit an exact first-party UUID route',()=>{
  const route='/account/ai?billing_order=c965fca2-7ef7-4cba-a30e-7de9a2ca6878';
  assert.equal(safeReturnTo(route),route);
  for(const bad of [route+'&next=https://attacker.invalid',route+'#redirect','https://attacker.invalid'+route,'//attacker.invalid/account/ai','/account/ai?task=generate&next=https://attacker.invalid','/account/ai?billing_order=invalid'])assert.equal(safeReturnTo(bad),'/account');
});

test('OAuth permits the exact public upscaler return and rejects appended redirect data',()=>{
 assert.equal(safeReturnTo('/tools/ai-image-upscaler'),'/tools/ai-image-upscaler');
 for(const bad of ['/tools/ai-image-upscaler?next=https://attacker.invalid','//attacker.invalid/tools/ai-image-upscaler','https://attacker.invalid/tools/ai-image-upscaler','/tools/ai-image-upscaler#private'])assert.equal(safeReturnTo(bad),'/account');
});
