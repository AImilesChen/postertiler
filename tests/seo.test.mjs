import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { routeSpecs, appRouteSpecs } from '../src/data.js';
const domain = 'https://postertiler.com';
const release = process.env.POSTERTILER_TEST_RELEASE === 'true';
const htmlPath = pathname => `dist${pathname === '/' ? '/index' : pathname}.html`;
test('23 released routes include public Pricing with unique metadata and real prerendered content', async () => {
  assert.equal(routeSpecs.length, 23); const titles = new Set(), descriptions = new Set();
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
  assert.equal(titles.size, 23); assert.equal(descriptions.size, 23);
  await access('dist/assets/brand/og-image.png');
});
test('Sitemap contains only public final-domain routes and robots matches the expected build mode', async () => {
  const sitemap = await readFile('dist/sitemap.xml', 'utf8'), robots = await readFile('dist/robots.txt', 'utf8');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 23);
  assert.ok(sitemap.includes('https://postertiler.com/pricing'));
  assert.ok(!/localhost|127\.0\.0\.1|\/cloud|\/account|_design/.test(sitemap));
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
