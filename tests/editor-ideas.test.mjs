import test from 'node:test';
import assert from 'node:assert/strict';
import {editorSizeFor,editorIdeas,editorPrompts} from '../src/editor-ideas.js';
test('editing chooses the closest supported shape for new source dimensions',()=>{
 for(const [w,h,shape] of [[1200,1800,'portrait'],[960,1280,'portrait'],[1200,1200,'square'],[1100,1000,'square'],[1920,1080,'landscape'],[1600,1000,'landscape']])assert.equal(editorSizeFor(w,h),shape);
 for(const [w,h] of [[0,100],[-1,100],[Infinity,100],[100,NaN]])assert.equal(editorSizeFor(w,h),'portrait');
});
test('editing examples are public source images with separate change and preservation instructions',()=>{
 assert.equal(editorIdeas.length,2);
 for(const item of [...editorIdeas,...editorPrompts]){assert.ok(item.prompt.length<=1000);assert.match(item.prompt,/keep|preserve/i);}
 for(const item of editorIdeas){assert.ok(item.image.startsWith('/assets/generator-inspiration/'));assert.match(item.source,/^https:\/\/www.metmuseum.org\//);}
});
