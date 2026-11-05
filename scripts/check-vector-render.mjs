import { chromium } from 'playwright';
import { browserOptions } from '../tests/browser-options.mjs';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tilePdf } from '../src/engine/document-tools.ts';
import { readPdf } from '../src/engine/pdf-input.ts';
import { pdfGroups } from '../src/engine/tools-model.ts';
import { DEFAULTS, pagePlans } from '../src/engine/geometry.ts';
const root = 'verification/v1.1/render'; await mkdir(root, { recursive: true });
const bytes = new Uint8Array(await readFile('tests/fixtures/vector-source.pdf')), { info } = await readPdf(bytes);
const assets = await readdir('dist/assets'), entry = assets.find(name => /^pdf-renderer-.*\.js$/.test(name));
const browser = await chromium.launch(browserOptions);
const tab = await browser.newPage(); const cases = [];
try {
  await tab.goto('http://127.0.0.1:4180/tools/pdf-poster-printer');
  for (let index = 0; index < 3; index++) {
    const result = await tab.evaluate(async ({ entry, encoded, index }) => {
      const { openPdf } = await import(`/assets/${entry}`); const task = openPdf(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
      const pdf = await task.promise, page = await pdf.getPage(index + 1), viewport = page.getViewport({ scale: 1 });
      const c = document.createElement('canvas'); c.width = Math.ceil(viewport.width); c.height = Math.ceil(viewport.height);
      await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport, annotationMode: 0, background: 'rgb(255,255,255)' }).promise;
      const result = { width: viewport.width, height: viewport.height, png: c.toDataURL('image/png').split(',')[1] }; await task.destroy(); return result;
    }, { entry, encoded: Buffer.from(bytes).toString('base64'), index });
    await writeFile(`${root}/source-${index + 1}.png`, Buffer.from(result.png, 'base64'));
    const settings = { ...DEFAULTS, cutGuides: false }, model = pdfGroups(info, settings, String(index + 1), 100), g = model.groups[0].geometry;
    const file = `${root}/tiled-${index + 1}.pdf`; await writeFile(file, await tilePdf(bytes, settings, String(index + 1), 100));
    execFileSync('pdftoppm', ['-r', '72', '-png', file, `${root}/tiles-${index + 1}`], { stdio: 'pipe', windowsHide: true });
    cases.push({ source: index + 1, referenceWidthPt: result.width, referenceHeightPt: result.height, geometry: g, plans: pagePlans(g) });
  }
} finally { await browser.close(); }
await writeFile(`${root}/model.json`, JSON.stringify(cases, null, 2));
const localPython = path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.POSTERTILER_TEST_PYTHON || (existsSync(localPython) ? localPython : 'python');
execFileSync(python, ['scripts/check-vector-pixels.py'], { stdio: 'inherit', windowsHide: true });
