import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PDFDocument, PDFName, PDFDict, PDFStream } from 'pdf-lib';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4180';
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1024 } }), page = await context.newPage();
const checks = [], errors = [], consoleErrors = [], external = [], writes = [], failedRequests = [];
let currentCheck = '';
await mkdir('verification/v1.1/screenshots', { recursive: true }); await mkdir('verification/v1.1/downloads', { recursive: true });
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ check: currentCheck, message: message.text() }); });
context.on('requestfailed', request => failedRequests.push({ check: currentCheck, protocol: request.url().split(':')[0], error: request.failure()?.errorText }));
context.on('request', request => {
  if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) external.push(new URL(request.url()).origin);
  if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method());
});
const go = path => page.goto(origin + path, { waitUntil: 'networkidle' });
const shot = name => page.screenshot({ path: `verification/v1.1/screenshots/${name}.png`, fullPage: true });
const check = async (name, run) => { currentCheck = name; await run(); checks.push({ name, result: 'passed' }); console.log('PASS', name); };
async function download(name, file) {
  const [result] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
  const target = `verification/v1.1/downloads/${file}.pdf`; await result.saveAs(target); return PDFDocument.load(await readFile(target));
}
async function uploadPdf(file = 'vector-source.pdf') {
  await page.locator('input[type=file]').setInputFiles(`tests/fixtures/${file}`);
  await page.locator('.file-label').filter({ hasText: 'source page' }).waitFor();
}
async function uploadImages(files = ['grid.jpg', 'transparent.png', 'transparent.webp']) {
  await page.locator('input[type=file]').setInputFiles(files.map(file => `tests/fixtures/${file}`));
  await page.getByRole('button', { name: `Preview page ${files.length}`, exact: true }).waitFor();
}
try {
  await check('Tools directory links to six working local tools', async () => {
    await go('/tools'); assert.equal(await page.locator('.tool-list>a').count(), 6); await shot('tools-desktop');
    for (const href of await page.locator('.tool-list>a').evaluateAll(es => es.map(e => e.getAttribute('href')))) assert.equal((await context.request.get(origin + href)).status(), 200);
  });
  await check('Multi-image upload, reorder, rotation and selected-page preview work', async () => {
    await go('/tools/image-to-pdf'); await uploadImages();
    await page.getByRole('button', { name: 'Move page 1 down', exact: true }).click();
    assert.ok((await page.locator('.image-order-list>li').first().innerText()).includes('transparent.png'));
    await page.getByRole('button', { name: 'Rotate page 2 clockwise', exact: true }).click();
    await page.getByRole('button', { name: 'Preview page 2', exact: true }).click();
    await page.locator('.sheet-preview-stage canvas').waitFor(); await shot('image-pdf-desktop');
    const doc = await download('Download Combined PDF', 'images-reordered'); assert.equal(doc.getPageCount(), 3);
    assert.ok(Math.abs(doc.getPage(1).getWidth() * 25.4 / 72 - 297) < .1);
  });
  await check('Placement and asymmetric Letter margins update the actual image PDF', async () => {
    await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('US Letter');
    await page.getByRole('combobox', { name: 'Orientation', exact: true }).selectOption('Portrait');
    await page.getByRole('checkbox', { name: 'Set margins separately', exact: true }).check();
    await page.getByRole('spinbutton', { name: 'Top margin', exact: true }).fill('7');
    await page.getByRole('spinbutton', { name: 'Left margin', exact: true }).fill('9');
    await page.getByRole('combobox', { name: 'Image placement', exact: true }).selectOption('fill');
    assert.equal(await page.getByRole('button', { name: 'Download again', exact: true }).count(), 0);
    const doc = await download('Download Combined PDF', 'images-letter-fill');
    for (const p of doc.getPages()) { assert.ok(Math.abs(p.getWidth() * 25.4 / 72 - 215.9) < .1); assert.ok(Math.abs(p.getHeight() * 25.4 / 72 - 279.4) < .1); }
  });
  await check('Invalid image batches preserve existing pages and removal returns to an empty state', async () => {
    await page.locator('input[type=file]').setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('broken') });
    await page.getByRole('alert').filter({ hasText: 'valid JPG' }).waitFor(); assert.equal(await page.locator('.image-order-list>li').count(), 3);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Remove page 1', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Download Combined PDF', exact: true }).isDisabled(), true);
  });
  await check('Twenty images export as twenty pages; a twenty-first image is rejected', async () => {
    await go('/tools/image-to-pdf'); await uploadImages(Array(20).fill('grid.jpg'));
    const doc = await download('Download Combined PDF', 'images-20-pages'); assert.equal(doc.getPageCount(), 20);
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/grid.jpg'); await page.getByRole('alert').filter({ hasText: 'up to 20' }).waitFor(); assert.equal(await page.locator('.image-order-list>li').count(), 20);
  });
  await check('Multi-image export cancels and can be retried without losing sources', async () => {
    await go('/tools/image-to-pdf'); await uploadImages(['24mp.jpg', '24mp.jpg']);
    await page.getByRole('button', { name: 'Download Combined PDF', exact: true }).click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByText('Preparation canceled.', { exact: false }).waitFor(); assert.equal(await page.locator('.image-order-list>li').count(), 2);
    const doc = await download('Download Combined PDF', 'images-retry-48mp'); assert.equal(doc.getPageCount(), 2);
  });
  await check('PDF preflight and rendered previews support CropBox, rotation and UserUnit', async () => {
    await go('/tools/pdf-poster-printer'); await uploadPdf(); await page.locator('.preview-canvas canvas').waitFor();
    assert.ok((await page.locator('.source-page-summary').innerText()).includes('26.0 × 18.0 cm'));
    assert.ok((await page.locator('.source-page-summary').innerText()).includes('30.0 × 20.0 cm'));
    await page.getByRole('combobox', { name: 'Preview source page', exact: true }).selectOption('1');
    await page.getByRole('tab', { name: 'Original', exact: true }).click(); await page.getByRole('img', { name: 'Original selected image', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Printed Sheets', exact: true }).click(); await shot('pdf-poster-desktop');
  });
  await check('Vector PDF export preserves text/font resources and creates correct page labels', async () => {
    const doc = await download('Download Tiled PDF', 'pdf-vector-all'); assert.equal(doc.getPageCount(), 14);
    assert.equal(doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image').length, 0);
    const labels = doc.catalog.lookup(PDFName.of('PageLabels'), PDFDict).lookup(PDFName.of('Nums')); assert.equal(labels.lookup(1, PDFDict).lookup(PDFName.of('P')).decodeText(), 'P1-A1');
  });
  await check('PDF range, custom scale, Letter orientation and page order control output', async () => {
    await page.getByRole('textbox', { name: 'Source pages', exact: true }).fill('3,2');
    await page.getByRole('combobox', { name: 'PDF scale', exact: true }).selectOption('custom'); await page.getByRole('spinbutton', { name: 'Scale', exact: true }).fill('150');
    await page.getByRole('combobox', { name: 'Paper size', exact: true }).selectOption('US Letter'); await page.getByRole('combobox', { name: 'Orientation', exact: true }).selectOption('Landscape');
    await page.getByRole('combobox', { name: 'Page order', exact: true }).selectOption('column-major');
    const doc = await download('Download Tiled PDF', 'pdf-custom-letter'); assert.ok(Math.abs(doc.getPage(0).getWidth() * 25.4 / 72 - 279.4) < .1);
    const labels = doc.catalog.lookup(PDFName.of('PageLabels'), PDFDict).lookup(PDFName.of('Nums')); assert.equal(labels.lookup(1, PDFDict).lookup(PDFName.of('P')).decodeText(), 'P3-A1');
    for (const [button, filename] of [['Download calibration page', 'pdf-calibration'], ['Download assembly maps', 'pdf-maps']]) {
      const doc = await download(button, filename); assert.ok(doc.getPageCount() >= 1);
    }
  });
  await check('Invalid PDF ranges and excessive output are rejected before export', async () => {
    await page.getByRole('textbox', { name: 'Source pages', exact: true }).fill('0'); await page.getByRole('alert').filter({ hasText: 'between 1 and 4' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Download Tiled PDF', exact: true }).isDisabled(), true);
    await page.getByRole('textbox', { name: 'Source pages', exact: true }).fill('1-4'); await page.getByRole('spinbutton', { name: 'Scale', exact: true }).fill('1000');
    await page.getByRole('alert').filter({ hasText: 'sheets' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Download Tiled PDF', exact: true }).isDisabled(), true);
  });
  await check('Annotations, layers and corrupt PDFs get explicit recoverable messages', async () => {
    await go('/tools/pdf-poster-printer'); await uploadPdf('annotated.pdf'); await page.getByRole('alert').filter({ hasText: 'Flatten' }).waitFor();
    await page.getByRole('textbox', { name: 'Source pages', exact: true }).fill('2'); assert.equal(await page.getByRole('button', { name: 'Download Tiled PDF', exact: true }).isEnabled(), true);
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/layers.pdf'); await page.getByRole('alert').filter({ hasText: 'layers' }).waitFor();
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/encrypted.pdf'); await page.getByRole('alert').filter({ hasText: 'encrypted' }).waitFor();
    await page.locator('input[type=file]').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') }); await page.getByRole('alert').filter({ hasText: 'valid PDF' }).waitFor();
  });
  await check('PDF export cancellation preserves settings and permits a successful retry', async () => {
    await go('/tools/pdf-poster-printer'); await uploadPdf(); await page.getByRole('textbox', { name: 'Source pages', exact: true }).fill('1');
    await page.getByRole('combobox', { name: 'PDF scale', exact: true }).selectOption('custom'); await page.getByRole('spinbutton', { name: 'Scale', exact: true }).fill('450');
    await page.getByRole('button', { name: 'Download Tiled PDF', exact: true }).click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByText('Preparation canceled.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('spinbutton', { name: 'Scale', exact: true }).inputValue(), '450');
    await page.getByRole('combobox', { name: 'PDF scale', exact: true }).selectOption('actual'); await page.getByRole('textbox', { name: 'Source pages', exact: true }).fill('2');
    const doc = await download('Download Tiled PDF', 'pdf-cancel-retry'); assert.equal(doc.getPageCount(), 2);
  });
  await check('Framed Grid exposes mounting gaps, preserves sheet count and exports', async () => {
    await go('/?sample=alpine&step=4'); await page.getByRole('combobox', { name: 'Poster layout', exact: true }).selectOption('framed');
    await page.getByRole('spinbutton', { name: 'Panel gap', exact: true }).fill('20'); assert.ok((await page.locator('.preview-summary').innerText()).includes('42.0 × 59.4 cm'));
    await page.getByRole('button', { name: '03 Poster Size', exact: false }).click(); assert.equal(await page.getByRole('button', { name: 'Exact size', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '05 Download PDF', exact: false }).click(); const doc = await download('Download Printable PDF', 'framed-grid-browser'); assert.equal(doc.getPageCount(), 4); await shot('framed-grid-desktop');
  });
  await check('Populated tools fit 390px and 320px screens and comparison retains source attribution', async () => {
    const longName = 'a-very-long-file-name-'.repeat(12) + '.jpg', grid = await readFile('tests/fixtures/grid.jpg');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await go('/tools/image-to-pdf'); await page.locator('input[type=file]').setInputFiles({ name: longName, mimeType: 'image/jpeg', buffer: grid }); await page.getByRole('button', { name: 'Preview page 1', exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await shot(`images-${width}`);
      await go('/tools/pdf-poster-printer'); await uploadPdf(); await page.locator('.preview-canvas canvas').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await shot(`pdf-${width}`);
      await go('/compare/rasterbator-alternative'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.ok(await page.getByRole('link', { name: 'Rasterbator.io official homepage', exact: true }).count()); await shot(`compare-${width}`);
    }
  });
  await check('Document processing and preview make no external or write requests', async () => {
    assert.deepEqual(external, []); assert.deepEqual(writes, []); assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  });
} finally {
  await writeFile('verification/v1.1/browser-tools.json', JSON.stringify({ environment: 'local', browser: browser.version(), checks, pageErrors: errors, consoleErrors, failedRequests, externalRequests: external, writeRequests: writes }, null, 2));
  await browser.close();
}
