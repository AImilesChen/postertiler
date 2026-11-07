import { ditherRgba } from './creative.ts';

export type DitherOptions = {
  algorithm: 'floyd' | 'bayer' | 'noise'; mode: 'bw' | 'colour' | 'duotone';
  cell: number; matrix: 2 | 4 | 8; levels: number; contrast: number; brightness: number;
  dark: string; light: string; invert: boolean;
};
export const DITHER_DEFAULTS: DitherOptions = { algorithm:'floyd', mode:'bw', cell:1, matrix:4, levels:4, contrast:100, brightness:100, dark:'#172638', light:'#f5e9ce', invert:false };
export const DITHER_PRESETS = [
  { id:'natural', name:'Natural B&W', description:'Fine, photographic grain', options:{...DITHER_DEFAULTS} },
  { id:'retro', name:'Retro Pixels', description:'An ordered, two-tone screen', options:{...DITHER_DEFAULTS,algorithm:'bayer',mode:'duotone',cell:3} as DitherOptions },
  { id:'colour', name:'Colour Dither', description:'Colour with a pixel texture', options:{...DITHER_DEFAULTS,algorithm:'bayer',mode:'colour',matrix:8,cell:3,levels:3} as DitherOptions },
  { id:'noise', name:'Noise Texture', description:'A scattered, inky texture', options:{...DITHER_DEFAULTS,algorithm:'noise',mode:'duotone',cell:2,dark:'#34301e',light:'#f4eedf'} as DitherOptions },
];
export function validateDither(o:DitherOptions) {
  if(!['floyd','bayer','noise'].includes(o.algorithm)||!['bw','colour','duotone'].includes(o.mode)||
    !Number.isInteger(o.cell)||o.cell<1||o.cell>12||![2,4,8].includes(o.matrix)||
    !Number.isInteger(o.levels)||o.levels<2||o.levels>8||!Number.isFinite(o.contrast)||o.contrast<0||o.contrast>200||
    !Number.isFinite(o.brightness)||o.brightness<0||o.brightness>200||
    !/^#[0-9a-f]{6}$/i.test(o.dark)||!/^#[0-9a-f]{6}$/i.test(o.light)||typeof o.invert!=='boolean'||
    o.algorithm==='floyd'&&o.mode!=='bw') throw new Error('Choose supported dithering settings.');
}
export function ditherSize(width:number,height:number,edge:number) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||![0,1024,2048].includes(edge)) throw new Error('Choose a supported output size.');
  const scale=edge?Math.min(1,edge/Math.max(width,height)):1;
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function bayerThreshold(x:number,y:number,size:number):number {
  // Recursively construct the ordered matrix; thresholds sit at bin midpoints.
  let rank=0;
  for(let bit=1;bit<size;bit*=2) rank=rank*4+[[0,2],[3,1]][(y&bit)?1:0][(x&bit)?1:0];
  return (rank+.5)/(size*size);
}
function noise(x:number,y:number) {
  // Coordinate hash: changing another setting or exporting never reshuffles the grain.
  let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^0x51f15e;
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
}
const rgb=(hex:string)=>[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16));
export function renderDither(rgba:Uint8ClampedArray,width:number,height:number,o:DitherOptions,progress=(_:number)=>{}) {
  validateDither(o);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.length!==width*height*4) throw new Error('Invalid image pixels.');
  const adjusted=new Uint8ClampedArray(rgba.length);
  for(let i=0;i<rgba.length;i+=4){
    const a=rgba[i+3]/255;
    for(let c=0;c<3;c++) adjusted[i+c]=Math.max(0,Math.min(255,((rgba[i+c]*a+255*(1-a))*o.brightness/100-127.5)*o.contrast/100+127.5));
    adjusted[i+3]=255;
  }
  if(o.algorithm==='floyd') return ditherRgba(adjusted,width,height,1,o.invert,progress);
  const out=new Uint8ClampedArray(rgba.length),dark=rgb(o.dark),light=rgb(o.light);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4,t=o.algorithm==='bayer'?bayerThreshold(x,y,o.matrix):noise(x,y);
      if(o.mode==='colour'){
        for(let c=0;c<3;c++){
          const value=(o.invert?255-adjusted[i+c]:adjusted[i+c])/255*(o.levels-1),base=Math.floor(value);
          out[i+c]=(Math.min(o.levels-1,base+(value-base>t?1:0)))/(o.levels-1)*255;
        }
      }else{
        let high=(.2126*adjusted[i]+.7152*adjusted[i+1]+.0722*adjusted[i+2])/255>t;
        if(o.invert)high=!high;
        for(let c=0;c<3;c++)out[i+c]=o.mode==='bw'?(high?255:0):(high?light[c]:dark[c]);
      }
      out[i+3]=255;
    }
    if(y%64===0)progress(y/height);
  }
  return out;
}
