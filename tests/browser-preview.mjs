import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { DEFAULTS } from '../src/engine/geometry.ts';
const origin = 'http://127.0.0.1:4180', out = 'verification/preview';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions), context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const page = await context.newPage(), checks = [], errors = [], external = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) external.push(new URL(request.url()).origin); });
async function check(name, run) { await run(); checks.push({ name, result: 'passed' }); console.log('PASS', name); }
const artboard = () => page.locator('.preview-artboard');
const tab = name => page.getByRole('tab', { name, exact: true });
const zoom = name => page.getByRole('button', { name, exact: true });
const summary = () => page.locator('.preview-summary').innerText();
async function open(settings = {}) {
  await page.goto(`${origin}/?sample=alpine&step=2&settings=${encodeURIComponent(JSON.stringify({ ...DEFAULTS, margin: 10, ...settings }))}`, { waitUntil: 'networkidle' });
  await artboard().waitFor();
}
try {
  await check('Default view is a continuous poster with page divisions, not separated paper images', async () => {
    await open(); assert.equal(await tab('Original').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.poster-image-surface img').count(), 1);
    assert.equal(await page.locator('.preview-page-divisions>g').count(), 2);
    assert.equal(await page.locator('.preview-panel-gaps rect').count(), 0);
    assert.ok((await summary()).includes('37.0 × 54.4 cm'));
    await page.screenshot({ path: `${out}/original-desktop.png`, fullPage: false });
  });
  await check('Printed Sheets is a labelled diagram with real 10 mm repeats and 370 x 544 mm final edge', async () => {
    await tab('Printed Sheets').click(); assert.equal(await page.locator('.poster-image-surface img').count(), 0);
    assert.equal(await page.locator('.preview-paper-outlines rect').count(), 4);
    assert.equal(await page.locator('.preview-overlap-areas rect').count(), 2);
    assert.equal(await page.locator('.preview-overlap-areas rect').first().getAttribute('width'), '10');
    assert.equal(await page.locator('.preview-finished-edge').getAttribute('width'), '370');
    assert.equal(await page.locator('.preview-finished-edge').getAttribute('height'), '544');
    assert.deepEqual(await page.locator('.preview-axis-labels text').allTextContents(), ['1', '2', 'A', 'B']);
    assert.equal(await page.getByRole('list', { name: 'Sheet layout legend' }).getByRole('listitem').count(), 4);
    await page.screenshot({ path: `${out}/sheets-desktop.png`, fullPage: false });
  });
  await check('Both views enlarge, scroll to their far edges, and return to fit without changing dimensions', async () => {
    const originalSize = await summary();
    for (const name of ['Original', 'Printed Sheets']) {
      await tab(name).click(); await zoom('Fit preview').click();
      const before = await artboard().boundingBox();
      for (let i = 0; i < 8; i++) await zoom('Zoom in').click();
      const after = await artboard().boundingBox(); assert.ok(Math.abs(after.width / before.width - 3) < .02);
      const stage = page.locator('.poster-preview-stage');
      assert.equal(await stage.evaluate(node => node.scrollWidth > node.clientWidth && node.scrollHeight > node.clientHeight), true);
      await stage.evaluate(node => { node.scrollLeft = node.scrollWidth; node.scrollTop = node.scrollHeight; });
      assert.equal(await stage.evaluate(node => node.scrollLeft > 0 && node.scrollTop > 0), true);
      assert.equal(await summary(), originalSize);
      await zoom('Fit preview').click();
      assert.equal(await stage.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1), true);
    }
  });
  await check('Fit/Fill preview uses the finished canvas, including whitespace and cropping', async () => {
    await open({ mode: 'exact', width: 400, height: 500, locked: false });
    const fit = await page.locator('.original-image').boundingBox(), surface = await page.locator('.poster-image-surface').boundingBox();
    assert.ok(fit.width < surface.width && Math.abs(fit.height - surface.height) < 1);
    await page.getByRole('button', { name: '03 Poster Size', exact: true }).click();
    await page.getByRole('radio', { name: 'Fill and crop', exact: true }).check();
    const fill = await page.locator('.original-image').boundingBox();
    assert.ok(fill.height > surface.height && Math.abs(fill.width - surface.width) < 1);
    assert.ok((await summary()).includes('40.0 × 50.0 cm'));
  });
  await check('Zero-overlap diagrams have no repeats; Framed Grid alone displays mounting gaps', async () => {
    await open({ overlap: 0 }); await tab('Printed Sheets').click(); assert.equal(await page.locator('.preview-overlap-areas rect').count(), 0);
    await open({ layoutMode: 'framed', gap: 10 }); assert.equal(await page.locator('.preview-panel-gaps rect').count(), 2);
    assert.equal(await page.locator('.preview-page-divisions>g').count(), 0);
    await tab('Printed Sheets').click(); assert.equal(await page.locator('.preview-overlap-areas rect').count(), 0);
  });
  await check('Keyboard tabs and full screen work, including Escape and focus restoration', async () => {
    await tab('Original').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await tab('Printed Sheets').getAttribute('aria-selected'), 'true');
    await zoom('Full screen').click(); await page.getByRole('dialog', { name: 'Poster preview' }).waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog', { name: 'Poster preview' }).count(), 0);
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Full screen');
    assert.equal(await zoom('Full screen').evaluate(node => node === document.activeElement), true);
  });
  await check('390 and 320 pixel layouts contain the preview; both views zoom inside it', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 950 }); await open();
      for (const name of ['Original', 'Printed Sheets']) {
        await tab(name).click(); await zoom('Fit preview').click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.locator('.preview-box').screenshot({ path: `${out}/${name === 'Original' ? 'original' : 'sheets'}-${width}.png` });
        for (let i = 0; i < 8; i++) await zoom('Zoom in').click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.equal(await page.locator('.poster-preview-stage').evaluate(node => node.scrollWidth > node.clientWidth), true);
        await zoom('Fit preview').click();
      }
    }
  });
  await check('PDF export still creates four A4 sheets with 10 mm physical margins after changing preview zoom', async () => {
    await page.setViewportSize({ width: 1440, height: 1100 }); await open(); await zoom('Zoom in').click();
    await page.getByRole('button', { name: '05 Download PDF', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Printable PDF', exact: true }).click()]);
    const target = `${out}/10mm-poster.pdf`; await download.saveAs(target);
    const pdf = await PDFDocument.load(await readFile(target)); assert.equal(pdf.getPageCount(), 4);
    for (const sheet of pdf.getPages()) { assert.ok(Math.abs(sheet.getWidth() * 25.4 / 72 - 210) < .1); assert.ok(Math.abs(sheet.getHeight() * 25.4 / 72 - 297) < .1); }
    assert.ok((await summary()).includes('37.0 × 54.4 cm'));
  });
  assert.deepEqual(errors, []); assert.deepEqual([...new Set(external)], []);
  await writeFile(`${out}/results.json`, JSON.stringify({ checks, errors, external }, null, 2));
  console.log(`${checks.length} browser preview checks passed`);
} finally { await browser.close(); }
