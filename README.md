# PosterTiler

Browser-based poster tiling and PDF tools for **postertiler.com**. The formal application source is maintained locally in the PosterTiler project's `app` directory and published at this repository root.

## Features

- Image poster maker, exact physical dimensions, printer margins, overlaps, Framed Grid, cut guides and optional removable label bands.
- Poster size calculator, example gallery and printing guides.
- Multiple images to PDF, with ordering and rotation.
- Existing PDF page tiling, preserving supported source text, embedded fonts and vector resources.
- Life-size poster scaling from selected subject bounds.
- Halftone dots, monochrome error-diffusion dithering and a combined RGB CMYK-style effect.

The current tools run locally in the browser. No account, image upload, payment or AI API is needed for poster processing. Future paid/cloud/AI services remain separate roadmap items.

## Run and verify

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
npm run typecheck
npm run build
npm test
```

The local application is at `http://127.0.0.1:4180`. The default build is `noindex`. `npm run build:release` checks the published policy files and produces the production build with indexing enabled.

Browser checks use Playwright. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when using an existing Chromium installation. The optional independent PDF rendering checks also require Poppler, Python and Pillow; see the scripts for configurable executable paths.

## Cloudflare

Deploy Workers Static Assets using the pinned Wrangler version and `wrangler.jsonc`. Build with `npm run build:release`, deploy with `npx wrangler deploy`. Cloudflare's Git integration can run these commands from this repository root. Keep credentials in the hosting platform's secret settings.

The public domain is `postertiler.com`. GA4, Search Console and Bing verification configuration is intentionally blank until post-launch setup. `.env.example` contains the supported public variables.

## Limits and evidence

Each tool shows its supported file, pixel and page limits. PDF layers, forms, encryption and printable annotations have explicit restrictions. CMYK-style output is combined RGB artwork, not prepress color-separation plates. Print at Actual Size / 100%; physical printing and assembly are separate user acceptance steps.

Third-party notices are retained in `third-party-licenses` and test fixtures. Public repository visibility does not grant a license to third-party trademarks, brand artwork or source material.
