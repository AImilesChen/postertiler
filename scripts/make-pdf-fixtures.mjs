import { PDFDocument, PDFName, PDFString, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile, writeFile } from 'node:fs/promises';
const pt = mm => mm * 72 / 25.4, pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
const font = await pdf.embedFont(await readFile('tests/fixtures/fonts/Vera.ttf'), { subset: true });
const draw = page => {
  const m = page.getMediaBox();
  page.drawRectangle({ x: m.x, y: m.y, width: m.width, height: m.height, color: rgb(1, 1, 1) });
  const cx = m.x + m.width / 2, cy = m.y + m.height / 2;
  for (const [dx, dy, color] of [[0, 0, rgb(.1, .55, .25)], [1, 0, rgb(.9, .7, .1)], [0, 1, rgb(.85, .08, .12)], [1, 1, rgb(.1, .3, .8)]])
    page.drawRectangle({ x: dx ? cx : m.x, y: dy ? cy : m.y, width: m.width / 2, height: m.height / 2, color });
  page.drawRectangle({ x: cx - 30, y: cy - 30, width: 100, height: 70, color: rgb(1, 1, 1), opacity: .5 });
  page.drawText('VECTOR / Embedded Vera font', { x: m.x + 35, y: cy + 25, size: 13, font, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: m.x + 35, y: cy }, end: { x: m.x + 35 + pt(100), y: cy }, thickness: 1.2, color: rgb(0, 0, 0) });
};
const normal = pdf.addPage([pt(400), pt(500)]); draw(normal);
normal.node.set(PDFName.of('Group'), pdf.context.obj({ S: 'Transparency', CS: 'DeviceRGB' }));
const cropped = pdf.addPage([pt(240), pt(330)]); cropped.setMediaBox(-pt(10), -pt(20), pt(240), pt(330)); cropped.setCropBox(pt(15), pt(25), pt(180), pt(260)); cropped.setRotation(degrees(90)); draw(cropped);
const unit = pdf.addPage([pt(100), pt(150)]); unit.node.set(PDFName.of('UserUnit'), pdf.context.obj(2)); unit.setRotation(degrees(270)); draw(unit);
pdf.addPage([pt(210), pt(297)]);
await writeFile('tests/fixtures/vector-source.pdf', await pdf.save());
const annotated = await PDFDocument.load(await pdf.save());
annotated.getPage(0).node.set(PDFName.of('Annots'), annotated.context.obj([annotated.context.register(annotated.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [20, 20, 100, 100], Contents: PDFString.of('PRINTABLE TEST NOTE') }))]));
await writeFile('tests/fixtures/annotated.pdf', await annotated.save());
const layers = await PDFDocument.load(await pdf.save()); layers.catalog.set(PDFName.of('OCProperties'), layers.context.obj({ OCGs: [] }));
await writeFile('tests/fixtures/layers.pdf', await layers.save());
console.log('Generated vector, embedded-font, rotation, CropBox, UserUnit, blank-page and unsupported-content fixtures.');
