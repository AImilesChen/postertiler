import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { routeSpecs } from '../src/data.js';
import { DEFAULTS } from '../src/engine/geometry.ts';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4180';
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && process.platform === 'win32') {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  const names = (await readdir(cache)).filter(n => /^chromium-\d+$/.test(n)).sort().reverse();
  if (names[0]) executablePath = path.join(cache, names[0], 'chrome-win64/chrome.exe');
}
await mkdir('verification/downloads', { recursive: true });
await mkdir('verification/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], external = [], mutations = [], checks = [], statuses = [];
page.on('pageerror', e => errors.push(e.message));
context.on('request', request => {
  if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) external.push({ origin: new URL(request.url()).origin, method: request.method() });
  if (!['GET', 'HEAD'].includes(request.method())) mutations.push({ method: request.method(), path: new URL(request.url()).pathname });
});
async function check(name, fn) {
  await fn(); checks.push({ name, result: 'passed' }); console.log('PASS', name);
}
async function goto(url = '/') { await page.goto(origin + url, { waitUntil: 'networkidle' }); }
async function upload(file) { await page.locator('input[type=file]').setInputFiles(file); await page.waitForFunction(() => document.querySelector('.step.active .step-no')?.textContent === '02'); }
async function shot(name, fullPage = true) { await page.screenshot({ path: `verification/screenshots/${name}.png`, fullPage }); }
async function download(button, name) {
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: button, exact: true }).click();
  const d = await pending; const file = `verification/downloads/${name}.pdf`; await d.saveAs(file);
  await page.getByText('Your PDF is ready', { exact: true }).waitFor();
  return PDFDocument.load(await readFile(file));
}
try {
  await check('Initial state shows only Upload, with no invented selected image', async () => {
    await goto(); assert.equal(await page.locator('.step.active').count(), 1); assert.ok((await page.locator('.step.active').innerText()).includes('01'));
    assert.equal(await page.locator('.upload-thumb').count(), 0); await shot('home-desktop');
  });
  await check('Gallery preset loads the real image and the approved size', async () => {
    await goto('/?sample=alpine&step=3'); await page.getByText('Finished size', { exact: true }).waitFor();
    assert.ok((await page.locator('.preview-summary').innerText()).includes('39.0 × 56.4 cm'));
    await shot('home-size-desktop'); await page.screenshot({ path: 'verification/screenshots/home-size-viewport.png' });
    await mkdir('public/assets/reference', { recursive: true });
    await copyFile('verification/screenshots/home-size-viewport.png', 'public/assets/reference/editor-v1.png');
    await copyFile('verification/screenshots/home-size-viewport.png', 'dist/assets/reference/editor-v1.png');
  });
  await check('Real browser A4 export is four correctly sized PDF pages', async () => {
    await page.getByRole('button', { name: '05 Download PDF', exact: false }).click();
    const doc = await download('Download Printable PDF', 'browser-a4'); assert.equal(doc.getPageCount(), 4);
    for (const p of doc.getPages()) { assert.ok(Math.abs(p.getWidth() * 25.4 / 72 - 210) < .1); assert.ok(Math.abs(p.getHeight() * 25.4 / 72 - 297) < .1); }
    await shot('download-ready-desktop');
  });
  await check('Calibration and assembly download separately from poster pages', async () => {
    for (const [button, name] of [['Download calibration page', 'browser-calibration'], ['Download assembly guide', 'browser-assembly']]) {
      const [d] = await Promise.all([page.waitForEvent('download'), page.locator('.settings-panel').getByRole('button', { name: button, exact: true }).click()]);
      await d.saveAs(`verification/downloads/${name}.pdf`); const doc = await PDFDocument.load(await readFile(`verification/downloads/${name}.pdf`)); assert.equal(doc.getPageCount(), 1);
    }
  });
  await check('Changing settings invalidates the previous prepared PDF', async () => {
    await page.getByRole('button', { name: '03 Poster Size', exact: false }).click(); await page.getByRole('spinbutton', { name: 'Sheets across', exact: true }).fill('3');
    await page.getByRole('button', { name: '05 Download PDF', exact: false }).click(); assert.equal(await page.getByRole('button', { name: 'Download again', exact: true }).count(), 0);
  });
  await check('Corrupt file produces a recoverable message', async () => {
    await goto(); await page.locator('input[type=file]').setInputFiles({ name: 'invalid.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('invalid image') });
    await page.getByRole('alert').filter({ hasText: 'valid JPG' }).waitFor(); assert.equal(await page.locator('.upload-thumb').count(), 0);
  });
  await check('EXIF rotated upload is interpreted before preview and export', async () => {
    await goto(); await upload('tests/fixtures/orientation-6.jpg');
    await page.getByRole('button', { name: '01 Upload', exact: false }).click(); await page.getByText(/100 × 200 px/).waitFor();
    await page.getByRole('button', { name: '05 Download PDF', exact: false }).click(); const doc = await download('Download Printable PDF', 'browser-exif');
    const image = doc.context.enumerateIndirectObjects().map(([, o]) => o).find(o => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');
    assert.equal(image.dict.get(PDFName.of('Width')).asNumber(), 100); assert.equal(image.dict.get(PDFName.of('Height')).asNumber(), 200);
    assert.equal(image.contents.includes(Buffer.from('PRIVATE_SOURCE_AUTHOR')), false);
  });
  await check('Transparent PNG and WebP both export without uploading', async () => {
    for (const ext of ['png', 'webp']) {
      await goto(); await upload(`tests/fixtures/transparent.${ext}`);
      await page.getByRole('button', { name: '05 Download PDF', exact: false }).click(); await download('Download Printable PDF', `browser-transparent-${ext}`);
    }
  });
  await check('24 MP image exports 100 sheets; cancellation keeps the source and permits retry', async () => {
    await goto(`/?settings=${encodeURIComponent(JSON.stringify({ ...DEFAULTS, columns: 10, rows: 10 }))}`);
    await upload('tests/fixtures/24mp.jpg'); await page.getByRole('button', { name: '05 Download PDF', exact: false }).click();
    await page.getByRole('button', { name: 'Download Printable PDF', exact: true }).click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Prepare PDF again', exact: true }).waitFor(); assert.equal(await page.locator('.upload-thumb').count(), 1);
    const doc = await download('Download Printable PDF', 'browser-24mp-100pages'); assert.equal(doc.getPageCount(), 100);
  });
  await check('Calculator passes exact settings into an empty uploader', async () => {
    await goto('/tools/poster-size-calculator'); await page.getByRole('button', { name: 'Exact size', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Width', exact: true }).fill('40'); await page.getByRole('spinbutton', { name: 'Height', exact: true }).fill('50');
    await page.getByRole('button', { name: 'Create Poster with These Settings', exact: false }).click(); await page.waitForURL(/settings=/);
    assert.equal(await page.locator('.upload-thumb').count(), 0); await upload('tests/fixtures/grid.jpg');
    await page.getByRole('button', { name: '03 Poster Size', exact: false }).click(); assert.equal(await page.getByRole('spinbutton', { name: 'Width', exact: true }).inputValue(), '40');
  });
  await check('Reset dialog traps keyboard focus and Escape restores the trigger', async () => {
    const trigger = page.getByRole('button', { name: 'Reset print settings', exact: true }); await trigger.click();
    await page.getByRole('dialog').waitFor(); await page.keyboard.press('Shift+Tab');
    assert.ok(await page.getByRole('button', { name: 'Reset settings', exact: true }).evaluate(e => e === document.activeElement));
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0); assert.ok(await trigger.evaluate(e => e === document.activeElement));
  });
  await check('Paste and drag/drop select images; multiple dropped files are rejected', async () => {
    const encoded = (await readFile('tests/fixtures/grid.jpg')).toString('base64');
    await goto();
    await page.evaluate(encoded => {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); const data = new DataTransfer();
      data.items.add(new File([bytes], 'clipboard.jpg', { type: 'image/jpeg' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, encoded);
    await page.waitForFunction(() => document.querySelector('.step.active .step-no')?.textContent === '02');
    await goto();
    await page.evaluate(encoded => {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); const data = new DataTransfer();
      data.items.add(new File([bytes], 'dropped.jpg', { type: 'image/jpeg' }));
      document.querySelector('.dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    }, encoded);
    await page.waitForFunction(() => document.querySelector('.step.active .step-no')?.textContent === '02');
    await goto(); await page.evaluate(() => {
      const data = new DataTransfer(); data.items.add(new File(['a'], 'a.jpg')); data.items.add(new File(['b'], 'b.jpg'));
      document.querySelector('.dropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    });
    await page.getByRole('alert').filter({ hasText: 'Choose one image' }).waitFor();
  });
  await check('Gallery filters, guide search and fullscreen use real controls', async () => {
    await goto('/gallery'); await page.getByRole('button', { name: 'Maps', exact: true }).click(); assert.equal(await page.locator('.gallery-item').count(), 1);
    await page.getByRole('button', { name: 'View sheet layout', exact: true }).click(); await page.getByRole('dialog', { name: 'An imaginary archipelago' }).waitFor();
    await page.getByRole('tab', { name: 'Original', exact: true }).click(); await page.getByRole('dialog').getByRole('img', { name: 'Original selected image' }).waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('link', { name: 'Try This Poster', exact: false }).click(); await page.waitForURL(/sample=map/);
    await page.getByRole('button', { name: 'Full screen', exact: true }).click(); await page.getByRole('dialog', { name: 'Poster preview' }).waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog', { name: 'Poster preview' }).count(), 0);
    await goto('/guides'); await page.getByRole('searchbox').fill('no-such-guide'); await page.getByText('No guides match that search.', { exact: false }).waitFor();
    await page.getByRole('searchbox').fill('assemble'); assert.equal(await page.locator('.guide-list>a').count(), 1);
  });
  await check('Exact Letter export keeps 400 x 500 mm and column-first labels', async () => {
    const settings = { ...DEFAULTS, paper: 'US Letter', mode: 'exact', width: 400, height: 500, margin: 6.35, overlap: 6.35, placement: 'fill', locked: false, pageOrder: 'column-major' };
    await goto(`/?settings=${encodeURIComponent(JSON.stringify(settings))}`); await upload('tests/fixtures/grid.jpg');
    await page.getByRole('button', { name: '03 Poster Size', exact: false }).click(); assert.equal(await page.getByRole('spinbutton', { name: 'Width', exact: true }).inputValue(), '40');
    await page.getByRole('button', { name: '05 Download PDF', exact: false }).click(); const doc = await download('Download Printable PDF', 'browser-letter-exact');
    assert.equal(doc.getPageCount(), 4); assert.ok(Math.abs(doc.getPage(0).getWidth() * 25.4 / 72 - 215.9) < .1);
    const labelDict = doc.catalog.lookup(PDFName.of('PageLabels')); const labels = labelDict.lookup(PDFName.of('Nums'));
    assert.equal(labels.lookup(3).lookup(PDFName.of('P')).decodeText(), 'B1');
  });
  await check('All released routes render at 1440, 390 and 320 pixels without horizontal overflow', async () => {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1024 : 844 });
      for (const route of routeSpecs) {
        const response = await page.goto(origin + route.path, { waitUntil: 'networkidle' }); assert.equal(response.status(), 200);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(overflow <= 1, `${width}px ${route.path}: overflow ${overflow}`);
        assert.equal(await page.locator('h1').count(), 1, `${route.path} needs one H1`); statuses.push({ width, path: route.path, status: 200, overflow });
      }
      await goto('/?sample=alpine&step=3'); await shot(`home-size-${width}`);
      if (width === 390) { await goto(); await shot('home-mobile'); await goto('/tools/poster-size-calculator'); await shot('calculator-mobile'); }
    }
  });
  await check('Unknown, design and later-stage URLs return HTTP 404', async () => {
    for (const route of ['/_design', '/pricing', '/unknown-page']) { const response = await page.goto(origin + route); assert.equal(response.status(), 404); }
  });
  await check('Unconfigured analytics, local file handling and rejection send no external requests', async () => {
    await goto(); await page.getByRole('button', { name: 'Cookie settings', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Accept analytics', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Reject analytics', exact: true }).click(); await page.reload();
    assert.deepEqual(external, []); assert.deepEqual(mutations, []); assert.deepEqual(errors, []);
  });
  await check('Content and metadata exist without JavaScript', async () => {
    const nojs = await browser.newContext({ javaScriptEnabled: false }); const tab = await nojs.newPage();
    for (const route of routeSpecs) { await tab.goto(origin + route.path); assert.equal(await tab.locator('h1').count(), 1); assert.ok(await tab.locator('link[rel=canonical]').getAttribute('href')); }
    await nojs.close();
  });
} finally {
  await writeFile('verification/v1.1/browser-regression.json', JSON.stringify({ environment: 'local', browser: browser.version(), origin, checks, statuses, pageErrors: errors, externalRequests: external, mutatingRequests: mutations, note: 'Chromium with desktop and emulated widths. Not physical iOS/Android or a physical print test.' }, null, 2));
  await browser.close();
}
