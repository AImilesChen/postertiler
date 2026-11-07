import test from 'node:test';
import assert from 'node:assert/strict';
import {DITHER_DEFAULTS,DITHER_PRESETS,validateDither,bayerThreshold,renderDither,ditherSize} from '../src/engine/dithering.ts';
const pixels=(w,h,rgb=[128,128,128,255])=>{const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set(rgb,i);return data;};
test('ordered matrices contain each threshold once, preserve midtones and repeat spatially',()=>{
 for(const n of [2,4,8]){
  const values=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++){values.push(bayerThreshold(x,y,n));assert.equal(bayerThreshold(x,y,n),bayerThreshold(x+n,y+n,n));}
  assert.equal(new Set(values).size,n*n);assert.equal(Math.min(...values),.5/(n*n));assert.equal(Math.max(...values),(n*n-.5)/(n*n));
  const out=renderDither(pixels(16,16),16,16,{...DITHER_DEFAULTS,algorithm:'bayer',matrix:n});
  assert.equal([...out].filter((v,i)=>i%4===0&&v===255).length,128);
 }
});
test('all presets are valid and render distinct, opaque output',()=>{
 const input=pixels(64,64);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;input.set([x*4,y*4,(x+y)*2,255],i);}
 const signatures=[];
 for(const preset of DITHER_PRESETS){validateDither(preset.options);const out=renderDither(input,64,64,preset.options);assert.equal(out.length,input.length);assert.ok(out.every((v,i)=>i%4!==3||v===255));signatures.push(Buffer.from(out).toString('base64'));}
 assert.equal(new Set(signatures).size,4);
});
test('duotone uses only the chosen palette, inversion swaps tones and noise is repeatable',()=>{
 const input=pixels(32,32),options={...DITHER_DEFAULTS,algorithm:'noise',mode:'duotone',dark:'#123456',light:'#fedcba'};
 const out=renderDither(input,32,32,options),again=renderDither(input,32,32,options),inverse=renderDither(input,32,32,{...options,invert:true});
 assert.deepEqual(out,again);let light=0;
 for(let i=0;i<out.length;i+=4){const value=[...out.slice(i,i+3)];assert.ok(JSON.stringify(value)==='[18,52,86]'||JSON.stringify(value)==='[254,220,186]');assert.notEqual(out[i],inverse[i]);light+=out[i]===254?1:0;}
 assert.ok(light>420&&light<610);
});
test('colour quantisation uses the configured levels and keeps black/white endpoints',()=>{
 const options={...DITHER_DEFAULTS,algorithm:'bayer',mode:'colour',levels:3};
 const out=renderDither(pixels(16,16,[50,128,210,255]),16,16,options);
 assert.ok(out.every((v,i)=>i%4===3||[0,128,255].includes(v)));
 assert.deepEqual([...renderDither(pixels(1,1,[0,0,0,255]),1,1,options)],[0,0,0,255]);
 assert.deepEqual([...renderDither(pixels(1,1,[255,255,255,255]),1,1,options)],[255,255,255,255]);
});
test('transparent pixels composite on white; brightness changes the source and leaves input intact',()=>{
 const input=pixels(4,4,[0,0,0,0]),copy=input.slice();
 const out=renderDither(input,4,4,DITHER_DEFAULTS);assert.ok(out.every(v=>v===255));assert.deepEqual(input,copy);
 assert.equal(renderDither(pixels(1,1),1,1,{...DITHER_DEFAULTS,brightness:0})[0],0);
 assert.equal(renderDither(pixels(1,1),1,1,{...DITHER_DEFAULTS,brightness:200})[0],255);
});
test('output dimensions retain aspect ratio, never upscale and validate unsupported inputs',()=>{
 assert.deepEqual(ditherSize(3000,2000,2048),{width:2048,height:1365});assert.deepEqual(ditherSize(600,800,2048),{width:600,height:800});assert.deepEqual(ditherSize(3000,2000,0),{width:3000,height:2000});
 for(const edge of [-1,1,4096,NaN])assert.throws(()=>ditherSize(600,800,edge));
 for(const options of [{cell:0},{cell:2.5},{matrix:16},{levels:9},{contrast:NaN},{dark:'red'},{algorithm:'floyd',mode:'colour'}])assert.throws(()=>validateDither({...DITHER_DEFAULTS,...options}));
 assert.throws(()=>renderDither(new Uint8ClampedArray(3),1,1,DITHER_DEFAULTS));
});
