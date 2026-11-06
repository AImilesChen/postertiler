import test from 'node:test';
import assert from 'node:assert/strict';
import {COLOUR_DEFAULTS,TREATMENT_DEFAULTS,adjustRgba,validateColour,isOriginalTreatment,lookFromQuery} from '../src/engine/image-adjustments.ts';
import {inspectFile,PROCESSED_IMAGE_BYTES} from '../src/engine/image.ts';

test('neutral colour settings preserve source pixels and alpha without changing the input',()=>{
 const input=new Uint8ClampedArray([255,0,0,255,0,255,0,180,0,0,255,0,53,125,201,37]);
 const original=[...input],out=adjustRgba(input,COLOUR_DEFAULTS);
 assert.deepEqual([...out],original);assert.deepEqual([...input],original);assert.equal(isOriginalTreatment(TREATMENT_DEFAULTS),true);
 assert.equal(isOriginalTreatment({...TREATMENT_DEFAULTS,brightness:101}),false);assert.equal(isOriginalTreatment({...TREATMENT_DEFAULTS,effect:'dots'}),false);
});
test('brightness, contrast, saturation, warmth and hue have independent visible effects',()=>{
 const pixel=new Uint8ClampedArray([120,80,40,255]);
 assert.deepEqual([...adjustRgba(pixel,{...COLOUR_DEFAULTS,brightness:0})],[0,0,0,255]);
 assert.deepEqual([...adjustRgba(pixel,{...COLOUR_DEFAULTS,contrast:0})],[128,128,128,255]);
 const grey=adjustRgba(new Uint8ClampedArray([255,0,0,200]),{...COLOUR_DEFAULTS,saturation:0});assert.deepEqual([...grey],[54,54,54,200]);
 const warm=adjustRgba(pixel,{...COLOUR_DEFAULTS,warmth:50}),cool=adjustRgba(pixel,{...COLOUR_DEFAULTS,warmth:-50});
 assert.ok(warm[0]>pixel[0]&&warm[2]<pixel[2]);assert.ok(cool[0]<pixel[0]&&cool[2]>pixel[2]);
 assert.notDeepEqual([...adjustRgba(pixel,{...COLOUR_DEFAULTS,hue:120})],[...pixel]);
});
test('colour parameters reject nonfinite and out-of-range values before pixel processing',()=>{
 for(const [key,values] of Object.entries({brightness:[-1,201,NaN],contrast:[-1,Infinity],saturation:[-2,201],warmth:[-101,101],hue:[-181,181]}))for(const value of values)assert.throws(()=>validateColour({...COLOUR_DEFAULTS,[key]:value}));
 assert.throws(()=>adjustRgba(new Uint8ClampedArray(3),COLOUR_DEFAULTS));
});
test('homepage look URLs accept four known look names without accepting external sources',()=>{
 for(const look of ['original','dots','dither','cmyk'])assert.equal(lookFromQuery(`?look=${look}`),look);
 for(const look of ['constructor','https://example.com/private.png','sepia',''])assert.equal(lookFromQuery(`?look=${encodeURIComponent(look)}`),null);
});
test('generated PNG capacity does not increase upload or pixel limits',async()=>{
 const header=new Uint8Array(32);header.set([137,80,78,71]);new DataView(header.buffer).setUint32(16,32);new DataView(header.buffer).setUint32(20,32);
 const generated={size:40*1024*1024,slice:()=>new Blob([header])};
 await assert.rejects(()=>inspectFile(generated),/32 MB/);assert.equal((await inspectFile(generated,PROCESSED_IMAGE_BYTES)).width,32);
 new DataView(header.buffer).setUint32(16,24001);await assert.rejects(()=>inspectFile(generated,PROCESSED_IMAGE_BYTES),/24 megapixels|12,000/);
 await assert.rejects(()=>inspectFile({size:PROCESSED_IMAGE_BYTES+1,slice:()=>new Blob([header])},PROCESSED_IMAGE_BYTES),/too large/);
});
