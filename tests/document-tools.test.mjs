import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, PDFDict, PDFStream } from 'pdf-lib';
import { readPdf } from '../src/engine/pdf-input.ts';
import { pageSelection, pdfGroups, imageSheetLayout, MERGE_DEFAULTS } from '../src/engine/tools-model.ts';
import { mergeJpegs, tilePdf, pdfAssembly } from '../src/engine/document-tools.ts';
import { DEFAULTS, pt } from '../src/engine/geometry.ts';
const bytes = new Uint8Array(await readFile('tests/fixtures/vector-source.pdf'));
const image = new Uint8Array(await readFile('tests/fixtures/grid.jpg'));
const { pdf: source, info } = await readPdf(bytes);
await mkdir('verification/v1.1', { recursive: true });
const close = (a, b) => assert.ok(Math.abs(a - b) < .000001, `${a} != ${b}`);
test('PDF preflight honors visible CropBox, negative media origin, rotation and UserUnit', () => {
  assert.equal(info.pages.length, 4); close(info.pages[0].widthMm, 400); close(info.pages[0].heightMm, 500);
  close(info.pages[1].widthMm, 260); close(info.pages[1].heightMm, 180);
  close(info.pages[2].widthMm, 300); close(info.pages[2].heightMm, 200); assert.equal(info.unembeddedFonts, false);
});
test('page ranges preserve requested order, remove duplicates and reject invalid selections', () => {
  assert.deepEqual(pageSelection('3,1-2,3', 4), [2, 0, 1]);
  for (const value of ['', '0', '2-1', '1,', '5', '1.5']) assert.throws(() => pageSelection(value, 4));
});
test('PDF tiling uses actual source dimensions and bounds output across all selected pages', () => {
  const model = pdfGroups(info, DEFAULTS, '1-3', 100); close(model.groups[0].geometry.width, 400); close(model.groups[0].geometry.height, 500);
  const scaled = pdfGroups(info, DEFAULTS, '2', 150); close(scaled.groups[0].geometry.width, 390); close(scaled.groups[0].geometry.height, 270);
  assert.throws(() => pdfGroups(info, DEFAULTS, '1-4', 1000)); assert.throws(() => pdfGroups(info, DEFAULTS, '1', 0));
});
test('vector PDF export retains embedded font streams, vector forms and labels without raster images', async () => {
  const output = await tilePdf(bytes, DEFAULTS, '1-4', 100); await writeFile('verification/v1.1/vector-tiled.pdf', output);
  const doc = await PDFDocument.load(output), model = pdfGroups(info, DEFAULTS, '1-4', 100);
  assert.equal(doc.getPageCount(), model.count);
  for (const page of doc.getPages()) { close(page.getWidth(), pt(210)); close(page.getHeight(), pt(297)); }
  const objects = doc.context.enumerateIndirectObjects().map(([, object]) => object);
  assert.equal(objects.filter(o => o instanceof PDFStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image').length, 0);
  assert.ok(objects.some(o => o instanceof PDFStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Form'));
  const fonts = document => document.context.enumerateIndirectObjects().map(([, o]) => o).filter(o => o instanceof PDFDict && o.has(PDFName.of('FontFile2')))
    .map(o => document.context.lookup(o.get(PDFName.of('FontFile2')), PDFStream)).map(s => createHash('sha256').update(s.getContents()).digest('hex'));
  assert.deepEqual(fonts(doc), fonts(source));
  const labels = doc.catalog.lookup(PDFName.of('PageLabels'), PDFDict).lookup(PDFName.of('Nums'));
  assert.equal(labels.lookup(1, PDFDict).lookup(PDFName.of('P')).decodeText(), 'P1-A1');
  const maps = await PDFDocument.load(await pdfAssembly(info, DEFAULTS, '1-4', 100)); assert.equal(maps.getPageCount(), 4);
});
test('selected source pages export in requested order at a custom scale', async () => {
  const output = await tilePdf(bytes, { ...DEFAULTS, paper: 'US Letter', orientation: 'Landscape', pageOrder: 'column-major' }, '3,2', 150);
  const doc = await PDFDocument.load(output); close(doc.getPage(0).getWidth(), pt(279.4));
  const labels = doc.catalog.lookup(PDFName.of('PageLabels'), PDFDict).lookup(PDFName.of('Nums'));
  assert.equal(labels.lookup(1, PDFDict).lookup(PDFName.of('P')).decodeText(), 'P3-A1');
  await writeFile('verification/v1.1/vector-custom-scale.pdf', output);
});
test('printable annotations and optional layers fail explicitly instead of silently disappearing', async () => {
  const annotated = await readPdf(new Uint8Array(await readFile('tests/fixtures/annotated.pdf')));
  assert.throws(() => pdfGroups(annotated.info, DEFAULTS, '1', 100), /Flatten/);
  assert.doesNotThrow(() => pdfGroups(annotated.info, DEFAULTS, '2', 100));
  await assert.rejects(readPdf(new Uint8Array(await readFile('tests/fixtures/layers.pdf'))), /layers/);
  await assert.rejects(readPdf(new Uint8Array(await readFile('tests/fixtures/encrypted.pdf'))), /encrypted/);
  await assert.rejects(readPdf(new Uint8Array([1, 2, 3])), /valid PDF/);
});
test('multi-image placement respects rotation, paper orientation, margins and Fit/Fill', async () => {
  const portrait = imageSheetLayout({ ...MERGE_DEFAULTS, orientation: 'Portrait' }, 800, 1000, 90);
  close(portrait.geometry.width, 200); assert.ok(portrait.placement.width <= 200);
  const automatic = imageSheetLayout(MERGE_DEFAULTS, 800, 1000, 90); close(automatic.geometry.pw, 297); close(automatic.geometry.ph, 210);
  const output = await mergeJpegs([{ jpeg: image, rotation: 0 }, { jpeg: image, rotation: 90 }, { jpeg: image, rotation: 180 }, { jpeg: image, rotation: 270 }], MERGE_DEFAULTS);
  const doc = await PDFDocument.load(output); assert.equal(doc.getPageCount(), 4);
  close(doc.getPage(0).getWidth(), pt(210)); close(doc.getPage(1).getWidth(), pt(297));
  await writeFile('verification/v1.1/images-rotations.pdf', output);
});
