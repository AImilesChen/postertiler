import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { routeSpecs } from '../src/data.js';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4180';
const indexable = process.env.EXPECT_PUBLIC_INDEXING === 'true';
const root = 'verification/v2/release'; await mkdir(root, { recursive:true });
const browser = await chromium.launch(browserOptions), context = await browser.newContext({ acceptDownloads:true, viewport:{width:1440,height:1024} }), page = await context.newPage();
const checks = [], errors = [], external = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
context.on('request', r => { if(/^https?:/.test(r.url()) && !r.url().startsWith(origin)) external.push(new URL(r.url()).origin); });
async function check(name, run) { await run(); checks.push({name,result:'passed'}); console.log('PASS',name); }
async function download(button, name) { const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button',{name:button,exact:true}).click()]); const p = `${root}/${name}.pdf`; await file.saveAs(p); return PDFDocument.load(await readFile(p)); }
try {
  await check('All twenty routes return the expected indexing policy, canonical URL and security headers', async () => {
    for(const route of routeSpecs) {
      const response = await context.request.get(origin + route.path), html = await response.text(); assert.equal(response.status(),200,route.path);
      assert.ok(html.includes(indexable ? 'content="index,follow"' : 'content="noindex,nofollow"'),route.path);
      assert.ok(html.includes(`rel="canonical" href="https://postertiler.com${route.path}"`));
      assert.equal(response.headers()['x-content-type-options'],'nosniff'); assert.ok(response.headers()['content-security-policy']?.includes("object-src 'none'"));
    }
  });
  await check('Published policies and contact contain confirmed operator facts with no draft fields', async () => {
    for(const path of ['/privacy','/terms','/cookies','/contact']) {
      await page.goto(origin+path,{waitUntil:'networkidle'}); const body = await page.locator('main').innerText();
      assert.ok(body.includes('mileschen')); assert.ok(body.includes('Mainland China')); assert.ok(body.includes('support@postertiler.com'));
      assert.ok(!/\[[A-Z][A-Z0-9_]+\]|Internal draft|Local review copy|Contact details are being prepared/.test(body));
      await page.setViewportSize({width:320,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true); await page.setViewportSize({width:1440,height:1024});
    }
  });
  await check('The existing image-poster worker exports a real four-page PDF under the release CSP', async () => {
    await page.goto(origin+'/',{waitUntil:'networkidle'}); await page.locator('input[type=file]').setInputFiles('tests/fixtures/grid.jpg');
    await page.getByRole('button',{name:/05 Download PDF/}).click(); const pdf = await download('Download Printable PDF','image-poster'); assert.equal(pdf.getPageCount(),4);
  });
  await check('Multi-image processing exports under the release CSP', async () => {
    await page.goto(origin+'/tools/image-to-pdf',{waitUntil:'networkidle'}); await page.locator('input[type=file]').setInputFiles(['tests/fixtures/grid.jpg','tests/fixtures/transparent.png']);
    await page.getByRole('button',{name:'Preview page 2',exact:true}).waitFor(); const pdf = await download('Download Combined PDF','combined-images'); assert.equal(pdf.getPageCount(),2);
  });
  await check('PDF.js module preview, fonts and vector tiling work under the release CSP', async () => {
    await page.goto(origin+'/tools/pdf-poster-printer',{waitUntil:'networkidle'}); await page.locator('input[type=file]').setInputFiles('tests/fixtures/vector-source.pdf');
    await page.locator('.preview-canvas canvas').waitFor(); const pdf = await download('Download Tiled PDF','tiled-pdf'); assert.equal(pdf.getPageCount(),14);
  });
  await check('No browser errors or external requests occur in release workflows', async () => { assert.deepEqual(errors,[]); assert.deepEqual(external,[]); });
} catch(e) { checks.push({name:'failure',result:'failed',message:e.message}); await page.screenshot({path:`${root}/failure.png`,fullPage:true}); process.exitCode=1; console.error(e); }
finally { await writeFile(`${root}/results.json`,JSON.stringify({origin,indexable,checks,errors,external},null,2)); await browser.close(); }
