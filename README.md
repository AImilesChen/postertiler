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

Optional Google sign-in is available on `/account`. The Worker uses the authorization-code flow with PKCE, state, nonce and verified ID-token signatures. It requests only `openid email profile`, never stores Google access/refresh tokens, and keeps the basic identity in a seven-day encrypted HttpOnly session cookie. There is no permanent user database in this release. All free tools remain usable anonymously.

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

The Worker handles `/api/*` and private account responses; ordinary tool assets keep asset-first routing. Configure `GOOGLE_CLIENT_SECRET` and `AUTH_COOKIE_KEY` as Cloudflare **Secrets**. The cookie key must be a randomly generated 32-byte base64url value. `AUTH_ORIGIN` and the public `GOOGLE_CLIENT_ID` are configured in Wrangler. The exact Google redirect URI is `https://postertiler.com/api/auth/callback/google`. Do not put either secret in `VITE_` variables. Changing the cookie key invalidates existing sessions.

For local Worker development, copy `.dev.vars.example` to `.dev.vars` and use separate local credentials, or leave sign-in unavailable. Run `npx wrangler dev --port 4181`; the example local origin is `http://127.0.0.1:4181`. Unit tests use generated signing keys and a fixture provider; `node tests/browser-auth.mjs` tests UI states with explicitly mocked responses, not a real Google account.

The public domain is `postertiler.com`. `src/tracking-config.json` contains public GA4, Clarity, Ahrefs Web Analytics, Shipsolo/Plausible and Bing verification identifiers; `build:release` applies them. These are browser tag identifiers, not server API credentials. A normal local build keeps optional analytics unconfigured. `.env.example` lists available overrides.

All four visitor providers require explicit analytics acceptance. Account/API/unknown paths and nonproduction hosts are excluded. Clarity masks file editors, previews and account navigation. Tags that inspect their own URLs/referrers are excluded on parameterized or unsafe contexts; GA4 uses explicit sanitized page fields. Withdrawal clears controlled analytics cookies and reloads the page. The expanded provider list uses a new consent version, so a former GA4-only acceptance is not reused. GSC uses existing DNS ownership verification; Bing uses the public meta verification tag.

## Limits and evidence

Each tool shows its supported file, pixel and page limits. PDF layers, forms, encryption and printable annotations have explicit restrictions. CMYK-style output is combined RGB artwork, not prepress color-separation plates. Print at Actual Size / 100%; physical printing and assembly are separate user acceptance steps.

Third-party notices are retained in `third-party-licenses` and test fixtures. Public repository visibility does not grant a license to third-party trademarks, brand artwork or source material.
