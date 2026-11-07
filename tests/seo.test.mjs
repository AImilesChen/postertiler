import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { routeSpecs, appRouteSpecs } from '../src/data.js';
const domain = 'https://postertiler.com';
const release = process.env.POSTERTILER_TEST_RELEASE === 'true';
const htmlPath = pathname => `dist${pathname === '/' ? '/index' : pathname}.html`;
test('22 released routes include public Pricing with unique metadata and real prerendered content', async () => {
  assert.equal(routeSpecs.length, 22); const titles = new Set(), descriptions = new Set();
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
  assert.equal(titles.size, 22); assert.equal(descriptions.size, 22);
  await access('dist/assets/brand/og-image.png');
});
test('Sitemap contains only public final-domain routes and robots matches the expected build mode', async () => {
  const sitemap = await readFile('dist/sitemap.xml', 'utf8'), robots = await readFile('dist/robots.txt', 'utf8');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 22);
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
