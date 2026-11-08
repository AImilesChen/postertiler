import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { routeSpecs, appRouteSpecs, guides, samples } from '../src/data.js';
import { render } from '../.ssr/entry-server.js';
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const origin = 'https://postertiler.com';
const indexing = env.VITE_PUBLIC_INDEXING === 'true';
const template = await readFile('dist/index.html', 'utf8');
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const descriptions = {
  dither: 'Create black-and-white, retro and colour dither effects with a free local image tool. Download PNG or turn your artwork into a printable poster. No sign-up.',
  'ai-editor': 'Upload an image, describe changes and compare the AI-edited result before making a printable poster. Optional one-time AI credits; currently invite-only.',
  'ai-upscaler': 'Enlarge images 2× or 4× with AI, compare real before-and-after results and prepare a printable poster. Optional credit-based cloud tool; currently invite-only.',
  'ai-generator': 'Describe artwork, explore editable prompt ideas and create an AI image for a printable poster. Optional one-time AI credits; currently an invite-only pilot.',
  pricing: 'Compare free poster PDFs, AI image credit packs from $4.99 and cloud exports from $1.99. One-time options with clear task costs. Currently test payments; AI is invite-only.',
  cloud: 'Sign in to prepare a private cloud poster PDF, review print settings and follow your task through to download.',
  'account-tasks': 'Your private PosterTiler cloud task history, progress and available PDF downloads.',
  'account-billing': 'Your private PosterTiler processing credits and order history.',
  'account-settings': 'Manage your PosterTiler sign-in and account information.',
  'life-size': 'Make a life-size poster from an image. Select subject bounds, set the physical height and download proportionally scaled A4, Letter or A3 sheets.',
  halftone: 'Create halftone dots, black-and-white dithering and CMYK-style screens locally, then download a tiled poster PDF with your chosen paper and layout.',
  tools: 'Free local tools for image tiling, poster dimensions, combining images into PDF and tiling PDF pages for printing.',
  'image-pdf': 'Combine JPG, PNG and WebP images into one PDF. Reorder pages, rotate images and choose paper, margins and Fit or Fill in your browser.',
  'pdf-poster': 'Tile an existing PDF over A4, Letter or A3 sheets at 100% or a custom scale, retaining existing embedded fonts and vector content.',
  compare: 'Compare PosterTiler and Rasterbator.io with dated source statements, test conditions and clearly scoped browser and PDF observations.',
  home: 'Turn any image into a giant poster. Split pictures into printable A4 or Letter pages, download a free PDF, and assemble your poster at home.',
  gallery: `Explore digital artwork, reviewed community projects and printable poster ideas. Share your project or take a print plan into the free PosterTiler poster maker.`,
  calculator: 'Calculate poster dimensions or sheet count for A4, Letter and A3. Account for printer margins, overlap and exact finished dimensions.',
  guides: 'Find practical poster printing guides for paper, margins, overlap, Fit and Fill, image quality and assembly. Download a calibration PDF and print checklist.',
  about: 'Meet PosterTiler, a free browser-based tool for turning one image into a large poster printed on ordinary paper.',
  privacy: 'Read how PosterTiler handles local image processing, website delivery, optional analytics and privacy requests.',
  terms: 'Terms for using the free PosterTiler image tiling tool, including image rights, local processing and printing conditions.',
  feedback: 'Send PosterTiler a suggestion, report a tool problem or share printing feedback. Optional screenshots and private account updates.',
  contact: 'Contact information and the details to include when asking for help with a PosterTiler print.',
  refunds: 'Review unused-credit refund calculations, service-failure exceptions, request status and the current Stripe test-payment release.',
  cookies: 'Understand optional analytics and local cookie preferences in PosterTiler. Rejecting analytics does not affect free PDF export.',
};
const manifest = [];
for (const route of [...appRouteSpecs, { id: '404', path: '/404', title: 'Page not found', kind: '404' }]) {
  const guide = guides.find(g => route.path === `/guides/${g.slug}`);
  const title = route.id === 'home' ? 'Free Block Poster Maker – Print Large Posters | PosterTiler' : `${route.title} | PosterTiler`;
  const description = descriptions[route.id] || guide?.intro || 'Return to the PosterTiler poster maker and printing guides.';
  const canonical = origin + (route.path === '/' ? '/' : route.path);
  const indexable = indexing && route.id !== '404' && !route.private;
  const schema = route.id === 'home' ? { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'PosterTiler', url: canonical, applicationCategory: 'DesignApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } } :
    guide ? { '@context': 'https://schema.org', '@type': 'Article', headline: guide.title, description, mainEntityOfPage: canonical } :
    { '@context': 'https://schema.org', '@type': 'WebPage', name: route.title, description, url: canonical };
  let html = template.replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/>/, `<meta name="robots" content="${indexable ? 'index,follow' : 'noindex,nofollow'}" />`)
    .replace('<div id="root"></div>', `<div id="root">${render(route.path)}</div>`);
  const verification = [['google-site-verification', env.VITE_GOOGLE_SITE_VERIFICATION], ['msvalidate.01', env.VITE_BING_SITE_VERIFICATION], ['ahrefs-site-verification', env.VITE_AHREFS_SITE_VERIFICATION]]
    .filter(([, value]) => value).map(([name, value]) => `<meta name="${name}" content="${esc(value)}" />`).join('\n');
  html = html.replace('</head>', `<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="${guide ? 'article' : 'website'}" /><meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${origin}/assets/brand/og-image.png" /><meta name="twitter:card" content="summary_large_image" />
${verification}<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script></head>`);
  const file = route.path === '/' ? 'dist/index.html' : `dist${route.path}.html`;
  await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true }); await writeFile(file, html);
  manifest.push({ path: route.path, title, description, canonical, indexable, private: !!route.private, file });
}
await writeFile('dist/robots.txt', indexing ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${manifest.filter(r => r.path !== '/404' && !r.private).map(r => `<url><loc>${r.canonical}</loc></url>`).join('')}</urlset>`);
await mkdir('verification', { recursive: true });
await writeFile('verification/routes.json', JSON.stringify(manifest, null, 2));
// This copied design-only image is replaced with an actual app screenshot during browser verification.
await rm('dist/assets/reference/editor-current.png', { force: true });
console.log(`Prerendered ${manifest.length - 1} V1 / V1.1 routes plus 404; indexing ${indexing ? 'enabled' : 'disabled'}.`);
