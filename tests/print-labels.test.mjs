import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFArray, PDFName, StandardFonts } from 'pdf-lib';
import { DEFAULTS, PRINT_DEFAULTS, geometry, pagePlans, sanitizeSettings, pt } from '../src/engine/geometry.ts';
import { posterPdf } from '../src/engine/pdf.ts';
import { tilePdf } from '../src/engine/document-tools.ts';
import { drawSheetLabel, sheetLabelText } from '../src/engine/print-labels.ts';
const jpeg = new Uint8Array(await readFile('tests/fixtures/grid.jpg'));
function text(doc, page) {
  const streams=page.node.Contents(), refs=streams instanceof PDFArray?streams.asArray():[streams];
  return refs.map(ref=>{const stream=doc.context.lookup(ref);const s=stream.dict.get(PDFName.of('Filter'))?.toString()==='/FlateDecode'?inflateSync(stream.contents).toString():Buffer.from(stream.contents).toString();
    return [...s.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('');}).join('');
}
test('new print jobs enable labels while explicit saved opt-outs and legacy dimensions survive',()=>{
  assert.equal(PRINT_DEFAULTS.labels,true);
  assert.equal(sanitizeSettings({...PRINT_DEFAULTS,labels:false}).labels,false);
  assert.equal(geometry(DEFAULTS).height,564);
  assert.equal(geometry(PRINT_DEFAULTS).height,554);
  const exact=geometry({...PRINT_DEFAULTS,mode:'exact',width:400,height:574,overlap:0});
  assert.equal(exact.height,574);assert.equal(exact.rows,3);
});
test('every printed raster page has its actual position, sequential page number and TOP in either order',async()=>{
  await mkdir('verification/print-labels',{recursive:true});
  for(const order of ['row-major','column-major']){
    const s={...PRINT_DEFAULTS,pageOrder:order},g=geometry(s),doc=await PDFDocument.load(await posterPdf(jpeg,s));
    assert.equal(doc.getPageCount(),4);
    pagePlans(g).forEach((p,i)=>assert.equal(text(doc,doc.getPage(i)),sheetLabelText(p.label,i,g.count)));
    await writeFile(`verification/print-labels/${order}.pdf`,await doc.save());
  }
  const off=await PDFDocument.load(await posterPdf(jpeg,DEFAULTS));
  assert.ok(off.getPages().every(p=>text(off,p)===''));
});
test('printed text and direction arrow fit inside reserved band for narrow and asymmetric sheets',async()=>{
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
  for(const input of [PRINT_DEFAULTS,{...PRINT_DEFAULTS,orientation:'Landscape',separateMargins:true,marginTop:4,marginBottom:12,marginLeft:3,marginRight:9},{...PRINT_DEFAULTS,margin:95}]){
    const g=geometry(input),draws=[];assert.equal(g.error,'');
    drawSheetLabel({drawText:(s,o)=>draws.push({text:s,...o}),drawLine:o=>draws.push(o)},font,g,'ZZ100',399,400);
    const top=pt(g.ph-g.margins.top-g.printableH),bottom=top-pt(g.labelBand),left=pt(g.margins.left),right=left+pt(g.printableW);
    for(const d of draws){if(d.text){assert.ok(d.y>=bottom);assert.ok(d.y+font.heightAtSize(d.size,{descender:false})<=top);assert.ok(d.x>=left);assert.ok(d.x+font.widthOfTextAtSize(d.text,d.size)<=right);}else for(const p of [d.start,d.end]){assert.ok(p.x>=left&&p.x<=right);assert.ok(p.y>=bottom&&p.y<=top);}}
  }
});
test('tiled vector PDFs print source-position labels with a global counter across source pages',async()=>{
  const bytes=new Uint8Array(await readFile('tests/fixtures/vector-source.pdf'));
  const output=await tilePdf(bytes,{...PRINT_DEFAULTS,pageOrder:'column-major'},'2,1',100),doc=await PDFDocument.load(output);
  for(const [i,page] of doc.getPages().entries())assert.match(text(doc,page),new RegExp(`P[12]-[A-Z]+\\d+  \\|  Page ${i+1} / ${doc.getPageCount()}  \\|  TOP`));
  await writeFile('verification/print-labels/vector.pdf',output);
});
