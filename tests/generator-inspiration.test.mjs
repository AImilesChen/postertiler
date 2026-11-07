import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {validateSpec} from '../server/ai/contract.mjs';

test('all generator inspiration files have distinct public-domain provenance and valid prompts',async()=>{
 const records=JSON.parse(await readFile('public/assets/generator-inspiration/provenance.json','utf8'));
 assert.equal(records.length,7);assert.equal(new Set(records.map(x=>x.image)).size,7);
 for(const record of records){
  assert.match(record.license,/Public domain/);assert.match(record.usage,/not a result/);
  assert.match(record.source,/^https:\/\/www\.metmuseum\.org\/art\/collection\/search\/\d+$/);
  assert.ok(!record.image.includes('/homepage/'));await access('public'+record.image);
 }
 const source=await readFile('src/generator-inspiration.js','utf8');
 const moduleSource=source.replace(/^import provenance.*\n/,'').replaceAll('export const ','const ')+'\nreturn {generatorIdeas,generatorPreview};';
 const {generatorIdeas,generatorPreview}=new Function('provenance',moduleSource)(records);
 assert.equal(generatorIdeas.length,6);
 for(const idea of [...generatorIdeas,generatorPreview]){
  assert.ok(idea.prompt.length<1000);const spec=validateSpec({kind:'generate',quality:'medium',size:idea.size,prompt:idea.prompt});assert.equal(spec.credits,3);
 }
});
