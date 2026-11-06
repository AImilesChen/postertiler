import { CLOUD_LIMITS, CloudError } from './contract.mjs';
const fail=()=>{throw new CloudError('invalid_image');};
function exifOrientation(bytes) {
  try {
    if(new TextDecoder().decode(bytes.slice(0,6))!=='Exif\0\0')return 1;
    const v=new DataView(bytes.buffer,bytes.byteOffset+6,bytes.byteLength-6),le=v.getUint16(0)===0x4949;
    if(v.getUint16(2,le)!==42)return 1;
    const start=v.getUint32(4,le),count=Math.min(v.getUint16(start,le),512);
    for(let i=0;i<count;i++){const p=start+2+i*12;if(v.getUint16(p,le)===274 && v.getUint16(p+2,le)===3 && v.getUint32(p+4,le)===1){const o=v.getUint16(p+8,le);return o>=1&&o<=8?o:1;}}
  }catch{}return 1;
}
export function cleanImage(bytes,mime,copy=true,limits=CLOUD_LIMITS) {
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let width=0,height=0,orientation=1,parts=[];
  if(mime==='image/jpeg') {
    if(bytes.length<12 || bytes[0]!==255 || bytes[1]!==216 || bytes.at(-2)!==255 || bytes.at(-1)!==217)fail();
    parts.push(bytes.subarray(0,2));let p=2,sos=false;
    while(p+4<=bytes.length) {
      const start=p;if(bytes[p++]!==255)fail();while(bytes[p]===255)p++;
      const m=bytes[p++];
      if(m===0xda){sos=true;parts.push(bytes.subarray(start));break;}
      if(m===0xd9)break;
      const n=v.getUint16(p);if(n<2 || p+n>bytes.length)fail();
      if([0xc0,0xc1,0xc2].includes(m)){if(n<8)fail();height=v.getUint16(p+3);width=v.getUint16(p+5);if(![1,3].includes(bytes[p+7]))throw new CloudError('unsupported_color');}
      if(m===0xe1)orientation=exifOrientation(bytes.subarray(p+2,p+n));
      // Drop comments, EXIF/GPS, thumbnails and embedded profile metadata.
      if(!(m>=0xe0&&m<=0xef) && m!==0xfe)parts.push(bytes.subarray(start,p+n));
      p+=n;
    }
    if(!sos || !width || !height)fail();
  } else if(mime==='image/png') {
    if(bytes.length<45 || Array.from(bytes.slice(0,8)).join(',')!=='137,80,78,71,13,10,26,10')fail();
    parts.push(bytes.subarray(0,8));let p=8,ended=false,hasData=false,first=true;
    while(p+12<=bytes.length){const n=v.getUint32(p);if(n>bytes.length-p-12)fail();const type=new TextDecoder().decode(bytes.subarray(p+4,p+8));
      if(first && (type!=='IHDR'||n!==13))fail();first=false;
      if(type==='IHDR'){width=v.getUint32(p+8);height=v.getUint32(p+12);if(bytes[p+16]!==8 || ![0,2,3,4,6].includes(bytes[p+17]) || bytes[p+18]!==0 || bytes[p+19]!==0 || bytes[p+20]!==0)throw new CloudError('unsupported_png');}
      if(type==='acTL')throw new CloudError('animated_image');
      if(type==='IDAT')hasData=true;
      if(['IHDR','PLTE','IDAT','IEND','tRNS'].includes(type))parts.push(bytes.subarray(p,p+n+12));
      p+=n+12;if(type==='IEND'){ended=true;break;}
    }
    if(!ended || !hasData || !width || !height)fail();
  } else throw new CloudError('unsupported_type');
  const max=mime==='image/png'?limits.pngPixels:limits.jpegPixels;
  if(width*height>max || width>limits.dimension || height>limits.dimension)throw new CloudError('image_too_large');
  const result=copy?new Uint8Array(parts.reduce((n,p)=>n+p.length,0)):bytes;let offset=0;if(copy)for(const part of parts){result.set(part,offset);offset+=part.length;}
  return {bytes:result,width:orientation>=5?height:width,height:orientation>=5?width:height,orientation,format:mime==='image/png'?'png':'jpeg'};
}
