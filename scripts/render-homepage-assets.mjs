// Offline authoring only. pdfjs-dist's optional @napi-rs/canvas renders the
// production worker unchanged, so homepage comparisons use the real algorithm.
import { createCanvas, loadImage, ImageData } from '@napi-rs/canvas';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { calibrationPdf, posterPdf, assemblyPdf } from '../src/engine/pdf.ts';
import { DEFAULTS, geometry } from '../src/engine/geometry.ts';
import { lifeSettings } from '../src/engine/creative.ts';
const out='public/assets/homepage', pdfOut='verification/homepage-expansion/source-pdfs'; await mkdir(out,{recursive:true}); await mkdir(pdfOut,{recursive:true});
globalThis.ImageData=ImageData;
globalThis.createImageBitmap=async blob=>{const im=await loadImage(Buffer.from(await blob.arrayBuffer()));im.close=()=>{};return im;};
globalThis.OffscreenCanvas=class {
 constructor(w,h){this.canvas=createCanvas(w,h);}
 get width(){return this.canvas.width;} set width(v){this.canvas.width=v;}
 get height(){return this.canvas.height;} set height(v){this.canvas.height=v;}
 getContext(...args){return this.canvas.getContext(...args);}
 async convertToBlob(){return new Blob([this.canvas.toBuffer('image/png')],{type:'image/png'});}
};
let finish, fail; globalThis.self={postMessage(message){if(message.type==='complete')finish(message);if(message.type==='error')fail(Error(message.message));}};
await import('../src/engine/creative.worker.ts');
const bytes=await readFile('public/assets/images/colour-and-form.png');
const original=await loadImage(bytes), records=[];
for(const effect of ['original','dots','dither','cmyk']){
 let im=original;
 if(effect!=='original'){
  const result=await new Promise((resolve,reject)=>{finish=resolve;fail=reject;self.onmessage({data:{blob:new Blob([bytes],{type:'image/png'}),crop:{left:0,top:0,right:100,bottom:100},options:{effect,cell:12,colour:false,contrast:1,invert:false}}});});
  im=await loadImage(Buffer.from(await result.blob.arrayBuffer()));
 }
 for(const width of [400,800]){
  const c=createCanvas(width,Math.round(im.height*width/im.width)),ctx=c.getContext('2d');ctx.drawImage(im,0,0,c.width,c.height);
  await writeFile(`${out}/look-${effect}-${width}.webp`,c.toBuffer('image/webp',90));
 }
 records.push({effect,source:'colour-and-form.png',width:im.width,height:im.height,cell:12,contrast:1});
}
await writeFile(`${out}/calibration-a4.pdf`,await calibrationPdf(DEFAULTS));
await writeFile(`${pdfOut}/example-poster.pdf`,await posterPdf(await readFile('public/assets/images/alpine-lake.png'),DEFAULTS,()=>{},'png'));
await writeFile(`${pdfOut}/example-assembly.pdf`,await assemblyPdf(DEFAULTS));
const portrait=await loadImage('public/assets/images/studio-movement.png');
await writeFile(`${out}/render-record.json`,JSON.stringify({effects:records,defaultExample:geometry(DEFAULTS),lifeExample:geometry(lifeSettings(1800,portrait))},null,2));
console.log('Rendered actual worker effects, calibration and example PDFs.');
