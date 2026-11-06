import { AiError,AI_LIMITS } from './contract.mjs';
import { cleanImage } from '../cloud/image.mjs';

const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){
 const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);
 let crc=0xffffffff;for(let i=4;i<out.length-4;i++)crc=crcTable[(crc^out[i])&255]^(crc>>>8);v.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}

// Derive a moderation-only copy from the actual server result, never a client
// thumbnail. Decode one PNG row at a time; keep the 24 MP download unchanged.
export async function moderationPng(bytes,maxEdge=1024){
 const image=cleanImage(bytes,'image/png',false,{pngPixels:AI_LIMITS.pixels,dimension:AI_LIMITS.dimension});
 const {width,height}=image,colour=bytes[25],channels={0:1,2:3,3:1,4:2,6:4}[colour],stride=width*channels;
 const scale=Math.min(1,maxEdge/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
 const raw=new Uint8Array(h*(w*3+1)),parts=[],v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let palette,alpha;
 for(let p=8;p+12<=bytes.length;){const n=v.getUint32(p),type=new TextDecoder().decode(bytes.subarray(p+4,p+8)),data=bytes.subarray(p+8,p+8+n);if(type==='IDAT')parts.push(data);if(type==='PLTE')palette=data;if(type==='tRNS')alpha=data;p+=n+12;}
 if(colour===3&&(!palette||palette.length%3))throw new AiError('invalid_result');
 let previous=new Uint8Array(stride),row=new Uint8Array(stride+1),offset=0,y=0,ty=0;
 const reader=new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 try{while(true){const {done,value}=await reader.read();if(done)break;let p=0;while(p<value.length){
  if(y>=height)throw new AiError('invalid_result');const n=Math.min(row.length-offset,value.length-p);row.set(value.subarray(p,p+n),offset);offset+=n;p+=n;if(offset!==row.length)continue;
  const filter=row[0],current=row.subarray(1);if(filter>4)throw new AiError('invalid_result');
  for(let i=0;i<stride;i++){const a=i>=channels?current[i-channels]:0,b=previous[i],c=i>=channels?previous[i-channels]:0;current[i]=(current[i]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
  if(ty<h&&y===Math.min(height-1,Math.floor((ty+.5)*height/h))){
   let dest=ty*(w*3+1)+1;
   for(let x=0;x<w;x++){const i=Math.min(width-1,Math.floor((x+.5)*width/w))*channels;let r,g,b,a=255;
    if(colour===3){const index=current[i];if(index*3+2>=palette.length)throw new AiError('invalid_result');[r,g,b]=palette.subarray(index*3,index*3+3);a=alpha?.[index]??255;}
    else if(colour===0||colour===4){r=g=b=current[i];if(colour===4)a=current[i+1];else if(alpha?.length===2&&alpha[0]===0&&alpha[1]===r)a=0;}
    else{r=current[i];g=current[i+1];b=current[i+2];if(colour===6)a=current[i+3];else if(alpha?.length===6&&alpha[0]===0&&alpha[1]===r&&alpha[2]===0&&alpha[3]===g&&alpha[4]===0&&alpha[5]===b)a=0;}
    raw[dest++]=Math.round((r*a+255*(255-a))/255);raw[dest++]=Math.round((g*a+255*(255-a))/255);raw[dest++]=Math.round((b*a+255*(255-a))/255);
   }ty++;
  }
  previous.set(current);offset=0;y++;
 }}}catch(error){await reader.cancel().catch(()=>{});throw error;}
 if(y!==height||offset||ty!==h)throw new AiError('invalid_result');
 const ihdr=new Uint8Array(13),header=new DataView(ihdr.buffer);header.setUint32(0,w);header.setUint32(4,h);ihdr[8]=8;ihdr[9]=2;
 const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 return new Uint8Array(await new Blob([bytes.subarray(0,8),chunk('IHDR',ihdr),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]).arrayBuffer());
}
