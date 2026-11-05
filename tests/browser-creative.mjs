import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PDFDocument, PDFName, PDFStream } from 'pdf-lib';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4180';
const out = 'verification/v2'; await mkdir(`${out}/screenshots`, { recursive: true }); await mkdir(`${out}/downloads`, { recursive: true });
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1024 } }), page = await context.newPage();
const checks = [], errors = [], external = [], requests = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(origin)) external.push(new URL(r.url()).origin); if (r.method() !== 'GET') requests.push(r.method()); });
async function check(name, action) { await action(); checks.push({ name, result: 'passed' }); console.log('PASS', name); }
const go = path => page.goto(origin + path, { waitUntil: 'networkidle' });
const button = name => page.getByRole('button', { name, exact: true });
const input = name => page.getByRole('spinbutton', { name, exact: true });
const select = name => page.getByRole('combobox', { name, exact: true });
async function upload(file = 'grid.jpg') { await page.locator('input[type=file]').setInputFiles(`tests/fixtures/${file}`); await page.locator('.file-label').waitFor(); }
async function apply(name) { await button(name).click(); await button('Download Printable PDF').waitFor({ state: 'visible' }); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Download Printable PDF')?.disabled); }
async function download(name) {
  const [d] = await Promise.all([page.waitForEvent('download'), button('Download Printable PDF').click()]);
  const path = `${out}/downloads/${name}.pdf`; await d.saveAs(path); return PDFDocument.load(await readFile(path));
}
try {
  await check('Six tools are linked and the two added routes respond', async () => {
    await go('/tools'); assert.equal(await page.locator('.tool-list>a').count(), 6);
    for (const href of ['/tools/life-size-poster-maker', '/tools/halftone-poster-maker']) assert.equal((await context.request.get(origin + href)).status(), 200);
  });
  await check('Subject bounds produce a proportional 180 cm canvas and a real PDF', async () => {
    await go('/tools/life-size-poster-maker'); assert.equal(await button('Download Printable PDF').isDisabled(), true); await upload();
    await input('Left bound').fill('25'); await input('Right bound').fill('75'); await input('Top bound').fill('10'); await input('Bottom bound').fill('90');
    await apply('Apply Subject Bounds'); await page.locator('.preview-canvas canvas').waitFor();
    assert.ok((await page.locator('.preview-summary').innerText()).includes('180.0 cm'));
    const count = Number(await page.locator('.metrics dd').nth(1).innerText());
    const pdf = await download('life-size-180cm'); assert.equal(pdf.getPageCount(), count); assert.equal(count > 4, true);
    const images = pdf.context.enumerateIndirectObjects().filter(([,v]) => v instanceof PDFStream && v.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');
    assert.equal(images.length, 1); assert.equal(images[0][1].dict.get(PDFName.of('Filter')).toString(), '/FlateDecode');
    await page.screenshot({ path: `${out}/screenshots/life-size-desktop.png`, fullPage: true });
  });
  await check('Changing units keeps the size and invalid bounds block export; repair preserves the image', async () => {
    await select('Height units').selectOption('in'); assert.ok(Math.abs(Number(await input('Finished subject height').inputValue()) - 70.866) < .002);
    await input('Top bound').fill('95'); assert.equal(await button('Apply Subject Bounds').isDisabled(), true); assert.equal(await button('Download Printable PDF').isDisabled(), true);
    await page.getByRole('alert').filter({ hasText: 'Keep the bottom' }).waitFor();
    await input('Top bound').fill('10'); await apply('Apply Subject Bounds'); assert.equal(await page.locator('.file-label').count(), 1);
    await select('Paper size').selectOption('US Letter'); await select('Orientation').selectOption('Landscape');
    const pdf = await download('life-size-letter'); assert.ok(Math.abs(pdf.getPage(0).getWidth() * 25.4 / 72 - 279.4) < .1);
  });
  await check('Dot screen is processed locally and embedded once losslessly across four sheets', async () => {
    await go('/tools/halftone-poster-maker'); await upload(); await apply('Apply Effect');
    const pdf = await download('halftone-dots'); assert.equal(pdf.getPageCount(), 4);
    const images = pdf.context.enumerateIndirectObjects().filter(([,v]) => v instanceof PDFStream && v.dict.get(PDFName.of('Subtype'))?.toString() === '/Image'); assert.equal(images.length, 1);
    assert.equal(images[0][1].dict.get(PDFName.of('Filter')).toString(), '/FlateDecode');
    await page.screenshot({ path: `${out}/screenshots/halftone-desktop.png`, fullPage: true });
    await input('Dot spacing').fill('20'); assert.equal(await button('Download Printable PDF').isDisabled(), true);
    await page.getByRole('checkbox', { name: 'Use image colours for dots', exact: true }).check(); await apply('Apply Effect'); await download('halftone-colour');
  });
  await check('Dither raster contains only black/white output and can be inverted', async () => {
    await select('Effect').selectOption('dither'); await apply('Apply Effect');
    await page.getByRole('tab', { name: 'Original', exact: true }).click(); const src = await page.getByRole('img', { name: 'Original selected image', exact: true }).getAttribute('src');
    const values = await page.evaluate(async src => { const image = new Image(); image.src = src; await image.decode(); const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d'); ctx.drawImage(image,0,0); const data = ctx.getImageData(0,0,c.width,c.height).data; const set = new Set(); for(let i=0;i<data.length;i+=4) { if(data[i]!==data[i+1] || data[i]!==data[i+2] || data[i+3]!==255) return ['invalid']; set.add(data[i]); } return [...set].sort((a,b)=>a-b); }, src);
    assert.deepEqual(values, [0,255]); await download('halftone-dither');
    await page.getByRole('checkbox', { name: 'Invert tones', exact: true }).check(); await apply('Apply Effect'); await download('halftone-dither-inverted');
  });
  await check('CMYK-style screen creates a real RGB artwork and prints with guides', async () => {
    await select('Effect').selectOption('cmyk'); await apply('Apply Effect'); await page.getByRole('tab', { name: 'Printed Sheets', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Printed page labels', exact: true }).check();
    const pdf = await download('halftone-cmyk-style'); assert.equal(pdf.getPageCount(), 4); assert.ok(pdf.catalog.get(PDFName.of('PageLabels')));
  });
  await check('Invalid files do not replace an existing source; processing can be canceled and retried', async () => {
    await page.locator('input[type=file]').setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('broken') });
    await page.getByRole('alert').filter({ hasText: 'valid JPG' }).waitFor(); assert.ok((await page.locator('.file-label').innerText()).includes('grid.jpg'));
    await upload('24mp.jpg'); await select('Effect').selectOption('dither'); await button('Apply Effect').click(); await button('Cancel').click();
    await page.getByText('Preparation canceled.', { exact: false }).waitFor(); assert.equal(await button('Download Printable PDF').isDisabled(), true);
    await upload(); await apply('Apply Effect'); await download('halftone-after-cancel');
  });
  await check('Both populated tools fit 390px and 320px widths', async () => {
    for (const width of [390,320]) for (const kind of ['life-size','halftone']) {
      await page.setViewportSize({ width, height: 844 }); await go(`/tools/${kind}-poster-maker`); await upload(); await apply(kind === 'life-size' ? 'Apply Subject Bounds' : 'Apply Effect');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: `${out}/screenshots/${kind}-${width}.png`, fullPage: true });
    }
  });
  await check('Creative tools produce no external requests or browser errors', async () => { assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(requests, []); });
} catch (e) { checks.push({ name: 'failed', result: 'failed', message: e.message }); await page.screenshot({ path: `${out}/screenshots/failure.png`, fullPage: true }); process.exitCode = 1; console.error(e); }
finally { await writeFile(`${out}/browser-creative.json`, JSON.stringify({ checks, errors, external, requests }, null, 2)); await browser.close(); }
