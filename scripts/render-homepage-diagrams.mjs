import { writeFile,readFile } from 'node:fs/promises';
import { geometry,DEFAULTS,pagePlans,sizeText } from '../src/engine/geometry.ts';
import { previewPlan } from '../src/engine/preview.ts';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const out='public/assets/homepage';
const wrap=(body,title)=>`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360" role="img" aria-label="${title}"><rect width="600" height="360" fill="#f5f6f5"/><defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#bdd1df"/><path d="M0 7L7 0" stroke="#688aa4"/></pattern></defs><g font-family="Arial,sans-serif" fill="#263e50">${body}</g></svg>`;
const attrs=r=>`x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"`;
const g=geometry({...DEFAULTS,margin:10,columns:1,rows:1}),m=g.margins;
await writeFile(`${out}/print-margins.svg`,wrap(`<g transform="translate(210 30) scale(.86)"><rect width="${g.pw}" height="${g.ph}" fill="white" stroke="#8294a1"/><rect x="${m.left}" y="${m.top}" width="${g.printableW}" height="${g.printableH}" fill="#d4e3ef" stroke="#345c77"/><path d="M-45 5H0 M-45 0V10 M-51 0H8" fill="none" stroke="#345c77"/><text x="-115" y="20" font-size="17">10 mm</text><text x="105" y="142" text-anchor="middle" font-size="17">Image area</text></g><text x="300" y="322" text-anchor="middle" font-size="17">A4 sheet · 10 mm white margins</text>`, 'A4 paper with 10 mm white printer margins surrounding the image area'));
for(const kind of ['overlap','gaps']){
 const settings={...DEFAULTS,columns:2,rows:1,margin:5,overlap:10,layoutMode:kind==='gaps'?'framed':'continuous',gap:10};
 const geom=geometry(settings),plan=previewPlan(geom,{width:geom.width,height:geom.height},'fill');
 const bodies=plan.pages.map(p=>`<rect ${attrs(p.paper)} fill="#fff" stroke="#8294a1"/><rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="#d4e3ef" stroke="#345c77"/>`).join('');
 const strips=plan.overlaps.map(r=>`<rect ${attrs(r)} fill="url(#hatch)"/>`).join('');
 const seam=kind==='gaps'?geom.printableW:geom.stepW;
 await writeFile(`${out}/print-${kind}.svg`,wrap(`<g transform="translate(76 28) scale(1.08 .85)">${bodies}${strips}<path d="M${seam} 100v40m10-40v40M${seam-30} 120h70" fill="none" stroke="#243f54" stroke-width="2"/><text x="${geom.width/2}" y="194" text-anchor="middle" font-size="19">10 mm ${kind==='gaps'?'open gap':'repeated image'}</text></g><text x="300" y="322" text-anchor="middle" font-size="17">${kind==='gaps'?'Trimmed panels + deliberate spacing':'Two sheets aligned at the overlap'}</text>`,kind==='gaps'?'Two trimmed A4 panels with a deliberate 10 mm gap included in the finished width':'Two A4 sheets with a hatched 10 mm repeated image overlap, not a white gap'));
}
async function pdfImage(file,target,width){
 const task=getDocument({data:new Uint8Array(await readFile(file)),useSystemFonts:true}),doc=await task.promise;
 const page=await doc.getPage(1),base=page.getViewport({scale:1}),vp=page.getViewport({scale:width/base.width});
 const canvas=createCanvas(Math.ceil(vp.width),Math.ceil(vp.height));
 await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
 await writeFile(target,canvas.toBuffer('image/webp',90));await task.destroy();
}
await pdfImage(`${out}/calibration-a4.pdf`,`${out}/calibration-thumb.webp`,400);
await pdfImage('verification/homepage-expansion/source-pdfs/example-poster.pdf',`${out}/example-page.webp`,600);
await pdfImage('verification/homepage-expansion/source-pdfs/example-assembly.pdf',`${out}/example-assembly.webp`,600);
console.log('Rendered geometry diagrams and real PDF previews.');
