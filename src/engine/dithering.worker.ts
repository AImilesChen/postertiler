/// <reference lib="webworker" />
import {inspectFile,validatePixels} from './image.ts';
import {renderDither,ditherSize,validateDither} from './dithering.ts';
const worker=self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage=async({data})=>{
  let bitmap:ImageBitmap|undefined;
  try{
    validateDither(data.options);await inspectFile(data.blob);
    bitmap=await createImageBitmap(data.blob,{imageOrientation:'from-image'});validatePixels(bitmap.width,bitmap.height);
    const {width,height}=ditherSize(bitmap.width,bitmap.height,data.edge),cell=data.options.cell;
    const w=Math.ceil(width/cell),h=Math.ceil(height/cell);
    const small=new OffscreenCanvas(w,h),ctx=small.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new Error('Image processing is unavailable.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();bitmap=undefined;
    const output=renderDither(ctx.getImageData(0,0,w,h).data,w,h,data.options,ratio=>worker.postMessage({type:'progress',ratio}));
    ctx.putImageData(new ImageData(output,w,h),0,0);
    const canvas=new OffscreenCanvas(width,height),target=canvas.getContext('2d');
    if(!target)throw new Error('Image processing is unavailable.');
    target.imageSmoothingEnabled=false;
    // Fit the complete sample grid, retaining every edge of the source composition.
    target.drawImage(small,0,0,width,height);
    const blob=await canvas.convertToBlob({type:'image/png'});
    small.width=small.height=canvas.width=canvas.height=1;
    worker.postMessage({type:'complete',blob,width,height});
  }catch(error){worker.postMessage({type:'error',message:error instanceof Error&&/^(Choose |This local tool|We could not)/.test(error.message)?error.message:'This image could not be processed. Try a smaller JPG, PNG or WebP.'});}
  finally{bitmap?.close();}
};
