import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

// Production-host simulation against the local release build. Vendor APIs are
// explicit fixtures: this test does not establish receipt in a real dashboard.
const local = 'http://127.0.0.1:4180', origin = 'https://postertiler.com', out = 'verification/tracking';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions), context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage(), checks = [], requests = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', entry => {
  const expected404 = entry.text().includes('status of 404') && entry.location().url === `${origin}/private/PRIVATE_FIXTURE_NAME@example.org`;
  if (entry.type() === 'error' && !expected404) errors.push(entry.text());
});
const fixture = {
  'www.googletagmanager.com': `const send=args=>{if(args[0]==='event')fetch('https://www.google-analytics.com/g/collect',{method:'POST',body:JSON.stringify({name:args[1],parameters:args[2]})});};window.dataLayer.forEach(send);const push=window.dataLayer.push.bind(window.dataLayer);window.dataLayer.push=function(args){send(args);return push(args);};`,
  'www.clarity.ms': `const old=window.clarity;window.clarity=function(){fetch('https://a.clarity.ms/collect',{method:'POST',body:JSON.stringify([...arguments])});};(old.q||[]).forEach(args=>window.clarity(...args));`,
  'analytics.ahrefs.com': `window.AhrefsAnalytics={sendEvent:(name,parameters)=>fetch('https://analytics.ahrefs.com/api/event',{method:'POST',body:JSON.stringify({name,parameters})})};`,
  'plausible.shipsolo.io': `const old=window.plausible;window.plausible=(name,parameters)=>fetch('https://plausible.shipsolo.io/api/event',{method:'POST',body:JSON.stringify({name,parameters})});(old.q||[]).forEach(args=>window.plausible(...args));`,
};
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin === origin) { const response = await context.request.get(local + url.pathname + url.search); await route.fulfill({ response }); return; }
  if (!/^https?:$/.test(url.protocol)) { await route.continue(); return; }
  requests.push({ host: url.host, path: url.pathname, method: request.method(), body: request.postData() });
  if (request.resourceType() === 'script' && fixture[url.host]) { await route.fulfill({ contentType: 'text/javascript', body: `(()=>{${fixture[url.host]}})();` }); return; }
  await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': origin } });
});
const button = name => page.getByRole('button', { name, exact: true });
const go = path => page.goto(origin + path, { waitUntil: 'networkidle' });
const tags = () => page.locator('script[id^="postertiler-"]');
const upload = async () => {
  await page.getByRole('button', { name: /^01 Upload/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'PRIVATE_FIXTURE_NAME@example.org.jpg', mimeType: 'image/jpeg', buffer: await readFile('tests/fixtures/grid.jpg') });
  await page.locator('.preview-artboard').waitFor();
};
async function check(name, run) { await run(); checks.push({ name, result: 'passed' }); console.log('PASS', name); }
async function download(name) {
  await button('05 Download PDF').click();
  const [file] = await Promise.all([page.waitForEvent('download'), button('Download Printable PDF').click()]);
  const target = `${out}/${name}.pdf`; await file.saveAs(target); assert.equal((await PDFDocument.load(await readFile(target))).getPageCount(), 4);
}
try {
  await check('No provider requests before a choice; refusal preserves real local PDF export', async () => {
    await go('/'); await page.getByRole('dialog', { name: 'Your analytics choice' }).waitFor();
    assert.equal(requests.length, 0); await button('Reject analytics').click(); await upload(); await download('rejected-export');
    assert.equal(requests.length, 0); assert.equal(await tags().count(), 0);
  });
  await check('Acceptance loads four providers under CSP and sends one pageview per reporting service', async () => {
    await button('Cookie settings').click(); await button('Accept analytics').click();
    await page.waitForFunction(() => window.AhrefsAnalytics && !window.plausible?.q && !window.clarity?.q);
    await page.waitForLoadState('networkidle');
    assert.equal(await tags().count(), 4);
    for (const host of Object.keys(fixture)) assert.equal(requests.filter(r => r.host === host && r.method === 'GET').length, 1);
    assert.equal(requests.filter(r => r.body && JSON.parse(r.body).name === 'page_view').length, 1);
    assert.equal(requests.filter(r => r.body && JSON.parse(r.body).name === 'pageview').length, 2);
    await button('Cookie settings').click(); await button('Accept analytics').click(); assert.equal(await tags().count(), 4);
    await page.screenshot({ path: `${out}/accepted-desktop.png`, fullPage: false });
  });
  await check('Real file selection and PDF preparation produce safe events, with sensitive UI masked', async () => {
    await upload(); await download('accepted-export'); await page.waitForLoadState('networkidle');
    const serialized = JSON.stringify(requests); assert.ok(serialized.includes('poster_start')); assert.ok(serialized.includes('pdf_ready'));
    assert.ok(!serialized.includes('PRIVATE_FIXTURE_NAME')); assert.ok(!serialized.includes('@example.org'));
    assert.equal(await page.locator('#poster-editor').getAttribute('data-clarity-mask'), 'true');
    assert.equal(await page.locator('.preview-wrap').getAttribute('data-clarity-mask'), 'true');
    assert.equal(await page.locator('.nav-auth').getAttribute('data-clarity-mask'), 'true');
  });
  await check('Withdrawal reloads with refusal and stops all subsequent vendor requests', async () => {
    await button('Cookie settings').click(); await button('Reject analytics').click(); await page.waitForLoadState('networkidle');
    assert.equal(await tags().count(), 0); const before = requests.length;
    await upload(); await download('withdrawn-export'); assert.equal(requests.length, before);
  });
  await check('Accepted preference still excludes account and unknown/private paths', async () => {
    await button('Cookie settings').click(); await button('Accept analytics').click();
    await page.waitForFunction(() => window.AhrefsAnalytics && !window.plausible?.q && !window.clarity?.q);
    await page.waitForLoadState('networkidle');
    const before = requests.length;
    await go('/account'); assert.equal(await tags().count(), 0);
    await go('/private/PRIVATE_FIXTURE_NAME@example.org'); assert.equal(await tags().count(), 0); assert.equal(requests.length, before);
  });
  await check('Parameterized URLs only send sanitized GA4 data, with no other visitor tags', async () => {
    const before = requests.length; await go('/?email=PRIVATE_QUERY@example.org');
    assert.equal(await tags().count(), 1); assert.equal(await tags().first().getAttribute('id'), 'postertiler-ga4');
    const added = JSON.stringify(requests.slice(before)); assert.ok(!added.includes('PRIVATE_QUERY')); assert.ok(!added.includes('email='));
  });
  await check('Cookie dialog fits narrow screens and exposes refusal and provider information', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 950 }); await button('Cookie settings').click();
      assert.ok((await page.getByRole('dialog', { name: 'Your analytics choice' }).innerText()).includes('Microsoft Clarity'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({ path: `${out}/consent-${width}.png`, fullPage: false }); await button('Close cookie settings').click();
    }
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${out}/browser-results.json`, JSON.stringify({ environment: 'local release build on simulated production hostname; vendor scripts and endpoints are fixtures', checks, errors,
    requests: requests.map(r => ({ ...r, body: r.body ? JSON.parse(r.body) : null })) }, null, 2));
  await browser.close();
}
