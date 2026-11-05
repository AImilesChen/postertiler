import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, PDFArray } from 'pdf-lib';
import { posterPdf, calibrationPdf, assemblyPdf } from '../src/engine/pdf.ts';
import { DEFAULTS, geometry, pagePlans, pt } from '../src/engine/geometry.ts';
import { inspectFile } from '../src/engine/image.ts';
const image = new Uint8Array(await readFile(new URL('fixtures/grid.jpg', import.meta.url)));
await mkdir('verification/downloads', { recursive: true });
const close = (a, b) => assert.ok(Math.abs(a - b) / pt(1) < .1, `${a} != ${b}`);
const content = (doc, page) => {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map(ref => doc.context.lookup(ref)) : [contents];
  return streams.map(s => s.dict.get(PDFName.of('Filter'))?.toString() === '/FlateDecode' ? inflateSync(s.contents).toString() : Buffer.from(s.contents).toString()).join('\n');
};
for (const [name, settings] of [
  ['A-a4', DEFAULTS],
  ['A-a4-10mm-margins', { ...DEFAULTS, margin: 10 }],
  ['B-letter-exact', { ...DEFAULTS, paper: 'US Letter', margin: 6.35, overlap: 6.35, mode: 'exact', width: 400, height: 500, placement: 'fill' }],
  ['C-zero-overlap', { ...DEFAULTS, overlap: 0, mode: 'exact', width: 400, height: 574 }],
  ['framed-grid', { ...DEFAULTS, layoutMode: 'framed', gap: 10 }],
  ['asymmetric-landscape', { ...DEFAULTS, orientation: 'Landscape', separateMargins: true, marginTop: 4, marginRight: 9, marginBottom: 12, marginLeft: 3, labels: true }],
]) test(`PDF ${name}: physical boxes, clipping, shared image and labels`, async () => {
  const bytes = await posterPdf(image, settings), doc = await PDFDocument.load(bytes), g = geometry(settings);
  assert.equal(doc.getPageCount(), g.count);
  for (const page of doc.getPages()) { close(page.getWidth(), pt(g.pw)); close(page.getHeight(), pt(g.ph)); assert.ok(content(doc, page).includes('W\nn')); }
  const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');
  assert.equal(images.length, 1, 'one source image shared across pages');
  assert.ok(doc.catalog.get(PDFName.of('PageLabels')));
  assert.ok(!bytes.includes(Buffer.from('PRIVATE_SOURCE_AUTHOR')));
  const tail = pagePlans(g).at(-1), commands = content(doc, doc.getPages().at(-1));
  const clipRect = commands.match(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\nW/);
  assert.ok(clipRect); close(Number(clipRect[1]), pt(g.margins.left)); close(Number(clipRect[3]), pt(tail.width)); close(Number(clipRect[4]), pt(tail.height));
  await writeFile(`verification/downloads/${name}.pdf`, bytes);
});
test('calibration and assembly are separate documents and use print scaling None', async () => {
  for (const [name, create] of [['calibration', calibrationPdf], ['assembly', assemblyPdf]]) {
    const bytes = await create(DEFAULTS), doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    const preferences = doc.catalog.getOrCreateViewerPreferences(); assert.equal(preferences.getPrintScaling(), 'None');
    if (name === 'calibration') {
      const lines = [...content(doc, doc.getPage(0)).matchAll(/([\d.-]+) ([\d.-]+) m\n([\d.-]+) ([\d.-]+) l/g)];
      const referenceLines = lines.filter(m => Math.abs(Math.hypot(Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])) * 25.4 / 72 - 100) < .1);
      assert.ok(referenceLines.length >= 2, 'horizontal and vertical references are independently 100 mm');
    }
    await writeFile(`verification/downloads/${name}.pdf`, bytes);
  }
});
test('image inspection rejects incorrect signatures and oversized dimensions before decoding', async () => {
  await assert.rejects(inspectFile(new Blob(['not-an-image'], { type: 'image/jpeg' })));
  const fake = new Uint8Array(24); fake.set([137, 80, 78, 71]); const view = new DataView(fake.buffer); view.setUint32(16, 20000); view.setUint32(20, 20000);
  await assert.rejects(inspectFile(new Blob([fake])), /24 megapixels/);
  for (const name of ['grid.jpg', 'transparent.png', 'transparent.webp', 'orientation-6.jpg', '24mp.jpg']) {
    const bytes = await readFile(new URL(`fixtures/${name}`, import.meta.url)); const result = await inspectFile(new Blob([bytes])); assert.ok(result.width > 0 && result.height > 0);
  }
});
