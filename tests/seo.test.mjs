import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { routeSpecs } from '../src/data.js';
const domain = 'https://postertiler.com';
const htmlPath = pathname => `dist${pathname === '/' ? '/index' : pathname}.html`;
test('20 released routes have unique titles, descriptions, canonical and real prerendered content', async () => {
  assert.equal(routeSpecs.length, 20); const titles = new Set(), descriptions = new Set();
  for (const route of routeSpecs) {
    const html = await readFile(htmlPath(route.path), 'utf8');
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1], description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
    assert.ok(title && description); titles.add(title); descriptions.add(description);
    assert.ok(html.includes(`rel="canonical" href="${domain}${route.path}"`));
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert.ok(html.includes('noindex,nofollow'), 'local preview must not be indexed');
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]); assert.ok(schema['@type']);
    for (const match of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const target = match[1]; if (target.startsWith('/assets/')) { await access('dist' + target); continue; }
      assert.ok(routeSpecs.some(r => r.path === target), `${route.path} links to unavailable ${target}`);
    }
  }
  assert.equal(titles.size, 20); assert.equal(descriptions.size, 20);
  await access('dist/assets/brand/og-image.png');
});
test('Sitemap contains only final-domain released routes and preview robots disallows crawling', async () => {
  const sitemap = await readFile('dist/sitemap.xml', 'utf8'), robots = await readFile('dist/robots.txt', 'utf8');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 20);
  assert.ok(!/localhost|127\.0\.0\.1|\/pricing|\/account|_design/.test(sitemap));
  assert.ok(robots.includes('Disallow: /'));
  assert.ok((await readFile('dist/404.html', 'utf8')).includes('This page is not here'));
});
