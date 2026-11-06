import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createCanvas,loadImage,ImageData} from '@napi-rs/canvas';
import {PDFDocument,PDFName,PDFRawStream} from 'pdf-lib';
import {posterPdf} from '../src/engine/pdf.ts';
import {DEFAULTS} from '../src/engine/geometry.ts';
import {COLOUR_DEFAULTS} from '../src/engine/image-adjustments.ts';

globalThis.ImageData=ImageData;
globalThis.createImageBitmap=async blob=>{const image=await loadImage(Buffer.from(await blob.arrayBuffer()));image.close=()=>{};return image;};
globalThis.OffscreenCanvas=class{
 constructor(w,h){this.canvas=createCanvas(w,h);}
 get width(){return this.canvas.width;}set width(v){this.canvas.width=v;}
 get height(){return this.canvas.height;}set height(v){this.canvas.height=v;}
 getContext(...args){return this.canvas.getContext(...args);}
 async convertToBlob(){return new Blob([this.canvas.toBuffer('image/png')],{type:'image/png'});}
};
let complete,fail;globalThis.self={postMessage(message){if(message.type==='complete')complete(message);if(message.type==='error')fail(Error(message.message));}};
await import('../src/engine/creative.worker.ts');
function render(blob,adjustments,options=null){return new Promise((resolve,reject)=>{complete=resolve;fail=reject;self.onmessage({data:{blob,crop:{left:0,top:0,right:100,bottom:100},adjustments,options}});});}
async function pixels(blob){const image=await loadImage(Buffer.from(await blob.arrayBuffer())),c=createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);return {width:image.width,height:image.height,data:ctx.getImageData(0,0,c.width,c.height).data};}
const source=createCanvas(32,16),ctx=source.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,16,16);ctx.fillStyle='#00ff00';ctx.fillRect(16,0,16,16);
const blob=new Blob([source.toBuffer('image/png')],{type:'image/png'});

test('the production worker renders adjusted source dimensions and embeds identical RGB pixels in PDF',async()=>{
 const output=await render(blob,{...COLOUR_DEFAULTS,saturation:0}),p=await pixels(output.blob);
 assert.equal(output.width,32);assert.equal(output.height,16);assert.deepEqual([...p.data.slice(0,4)],[54,54,54,255]);assert.deepEqual([...p.data.slice(16*4,16*4+4)],[182,182,182,255]);
 const doc=await PDFDocument.load(await posterPdf(new Uint8Array(await output.blob.arrayBuffer()),DEFAULTS,()=>{},'png'));
 assert.equal(doc.getPageCount(),4);
 const image=doc.context.enumerateIndirectObjects().map(([,o])=>o).find(o=>o instanceof PDFRawStream&&o.dict.get(PDFName.of('Subtype'))?.toString()==='/Image'&&o.dict.get(PDFName.of('ColorSpace'))?.toString()==='/DeviceRGB');
 assert.ok(image);const rgb=inflateSync(image.contents),expected=Uint8Array.from([...p.data].filter((_,i)=>i%4!==3));assert.deepEqual(new Uint8Array(rgb),expected);
});
test('basic adjustments run before dithering and screen effects remain usable',async()=>{
 const c=createCanvas(32,32),context=c.getContext('2d');context.fillStyle='rgb(80,80,80)';context.fillRect(0,0,32,32);const mid=new Blob([c.toBuffer('image/png')],{type:'image/png'}),style={effect:'dither',cell:12,colour:false,contrast:1,invert:false};
 const normal=await pixels((await render(mid,COLOUR_DEFAULTS,style)).blob),bright=await pixels((await render(mid,{...COLOUR_DEFAULTS,brightness:200},style)).blob);
 const countWhite=data=>{let n=0;for(let i=0;i<data.length;i+=4){assert.ok(data[i]===0||data[i]===255);n+=data[i]===255?1:0;}return n;};
 assert.ok(countWhite(bright.data)>countWhite(normal.data)+200);
 for(const effect of ['dots','cmyk']){const result=await render(blob,COLOUR_DEFAULTS,{...style,effect,cell:4});assert.equal(result.width,32);assert.equal(result.height,16);}
});
test('invalid adjustment settings fail with a safe recovery message',async()=>{
 await assert.rejects(()=>render(blob,{...COLOUR_DEFAULTS,hue:999}),/Choose brightness/);
});
