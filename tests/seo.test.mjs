import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { routeSpecs, appRouteSpecs } from '../src/data.js';
const domain = 'https://postertiler.com';
const release = process.env.POSTERTILER_TEST_RELEASE === 'true';
const htmlPath = pathname => `dist${pathname === '/' ? '/index' : pathname}.html`;
test('30 released routes include public Pricing with unique metadata and real prerendered content', async () => {
  assert.equal(routeSpecs.length, 30); const titles = new Set(), descriptions = new Set();
  for (const route of routeSpecs) {
    const html = await readFile(htmlPath(route.path), 'utf8');
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1], description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
    assert.ok(title && description); titles.add(title); descriptions.add(description);
    assert.ok(html.includes(`rel="canonical" href="${domain}${route.path}"`));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert.equal(html.match(/<meta name="robots" content="([^"]*)"/)?.[1],release?'index,follow':'noindex,nofollow',release?'released public routes must be indexable':'local preview must not be indexed');
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]); assert.ok(schema['@type']);
    for (const match of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const target = match[1]; if (target.startsWith('/assets/')) { await access('dist' + target); continue; }
      assert.ok(appRouteSpecs.some(r => r.path === target), `${route.path} links to unavailable ${target}`);
    }
  }
  assert.equal(titles.size, 30); assert.equal(descriptions.size, 30);
  await access('dist/assets/brand/og-image.png');
});
test('Sitemap contains only public final-domain routes and robots matches the expected build mode', async () => {
  const sitemap = await readFile('dist/sitemap.xml', 'utf8'), robots = await readFile('dist/robots.txt', 'utf8');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 30);
  assert.ok(sitemap.includes('https://postertiler.com/pricing'));
  assert.ok(!/localhost|127\.0\.0\.1|\/cloud|\/account|\/admin|_design/.test(sitemap));
  assert.ok(robots.includes(release?'Allow: /':'Disallow: /'));
  if(release)assert.ok(robots.includes('Sitemap: '+domain+'/sitemap.xml'));
  assert.ok((await readFile('dist/404.html', 'utf8')).includes('This page is not here'));
});

test('public enhancement content is indexable while personal AI history stays private',async()=>{
 const page=await readFile(htmlPath('/tools/ai-image-upscaler'),'utf8'),privatePage=await readFile(htmlPath('/account/ai'),'utf8'),sitemap=await readFile('dist/sitemap.xml','utf8');
 assert.ok(page.includes('Three steps. No prompt needed.'));assert.ok(page.includes('What happens if enhancement fails?'));
 assert.ok(page.includes('https://postertiler.com/tools/ai-image-upscaler'));assert.ok(sitemap.includes('/tools/ai-image-upscaler'));
 assert.match(privatePage,/<meta name="robots" content="noindex,nofollow"/);assert.ok(!sitemap.includes('/account/ai'));
 assert.ok(!page.includes('fixture@example.invalid'));
});

test('generator discovery page is prerendered with honest reference artwork and no account history',async()=>{
 const page=await readFile(htmlPath('/tools/ai-image-generator'),'utf8'),sitemap=await readFile('dist/sitemap.xml','utf8');
 assert.ok(page.includes('AI Image Generator for Posters'));assert.ok(page.includes('Find a look. Make it your own.'));
 assert.ok(page.includes('Style references, not results from this generator.'));assert.ok(page.includes('What happens if a prompt or image is blocked?'));
 assert.ok(sitemap.includes('/tools/ai-image-generator'));assert.ok(!page.includes('AI credit orders'));
 assert.equal((page.match(/View prompt &amp; artwork source/g)||[]).length,6);
});


test('editor has public discovery content but never exposes account history',async()=>{
 const page=await readFile(htmlPath('/tools/ai-image-editor'),'utf8'),sitemap=await readFile('dist/sitemap.xml','utf8');
 assert.ok(page.includes('Keep the idea. Change the feeling.'));assert.ok(page.includes('Change this. Keep that.'));
 assert.ok(page.includes('Will the result have the same shape and resolution?'));assert.ok(sitemap.includes('/tools/ai-image-editor'));
 assert.ok(!page.includes('AI credit orders'));assert.ok(!sitemap.includes('/account/ai'));
 assert.equal((page.match(/Real AI edit · Standard quality/g)||[]).length,2);
 for(const id of ['dawn','background'])await access('dist/assets/editor-examples/'+id+'-result.webp');
});


test('dithering is a public local tool with crawlable examples and no AI account gate',async()=>{
 const html=await readFile(htmlPath('/tools/dithering-tool'),'utf8');
 assert.ok(html.includes('Image Dithering Tool'));assert.ok(html.includes('Image dithering, explained.'));
 assert.ok(html.includes('Download PNG'));assert.ok(html.includes('No sign-up or watermark'));
 for(const asset of ['portrait-effect.png','waves-effect.png','irises-effect.png']){assert.ok(html.includes(asset));await access('dist/assets/dither-examples/'+asset);}
 assert.ok((await readFile('dist/tools.html','utf8')).includes('/tools/dithering-tool'));
 assert.ok((await readFile('dist/sitemap.xml','utf8')).includes('/tools/dithering-tool'));
});


test('guide hub and new articles expose real preparation, keyword help and crawlable reading paths',async()=>{
 const hub=await readFile(htmlPath('/guides'),'utf8');
 for(const text of ['What needs fixing?','Find a printing guide','Check one sheet first.','Calibration PDF','Print checklist'])assert.ok(hub.includes(text),text);
 for(const slug of ['printer-margins-and-overlap','fit-vs-fill-poster','paper-size-and-orientation']){
  const page=await readFile(htmlPath('/guides/'+slug),'utf8');assert.ok(page.includes('On this page'));assert.ok(page.includes('guide-step-0'));assert.ok(page.includes('Common mistakes'));
  assert.ok((await readFile('dist/sitemap.xml','utf8')).includes('/guides/'+slug));
 }
 const scale=await readFile(htmlPath('/guides/how-to-print-a-pdf-at-actual-size'),'utf8');assert.ok(scale.includes('/assets/guides/calibration-preview.webp'));assert.ok(!scale.includes('/assets/reference/editor-v1.png'));
 const quality=await readFile(htmlPath('/guides/image-resolution-for-large-posters'),'utf8');assert.ok(quality.includes('/tools/ai-image-upscaler'));assert.ok(!quality.includes('The V1 tool does not call'));
});
