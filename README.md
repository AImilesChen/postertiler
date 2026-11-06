# PosterTiler

Version 1.10.1 adds a **Size reference** switch to the poster editor's Original preview. It compares the finished poster with an original 180 cm silhouette using one millimetre scale and a shared baseline, with a height ruler in the selected unit. It starts off to preserve the close-up editing view; switching it on fits the person and poster together. Zoom and fullscreen keep their relative sizes. The Printed Sheets assembly diagram and all PDF output remain independent of the reference artwork.

Version 1.10 adds an optional **Image adjustments** panel after upload in the poster editor. Brightness, contrast, saturation, warmth and hue can be combined with Original, Halftone dots, B&W dither or CMYK-style art effects. Homepage “Try this look” buttons apply the effect to the current image without replacing its paper settings; with no selected image, they load the bundled Colour and form example. Existing numeric step links keep their meanings.

Image edits run locally at full source dimensions in a cancellable Worker. The preview and PDF share the same generated PNG; export waits for the latest render and embeds that PNG without JPEG re-encoding. Restore original, cancel, retry and failed-render recovery retain the selected source. Generated PNGs have an internal 128 MiB inspection allowance; user uploads remain capped at 32 MiB / 24 MP / 12,000 px per side. Cloud PDF still uses its separate file selection and consent flow.

Version 1.7 adds public `/pricing`, an independent `/cloud` workspace and a wider account dashboard. `/account` shows credits and recent tasks; `/account/tasks` provides filtered, paginated tasks; `/account/billing` provides plans and filtered, paginated orders; `/account/settings` holds Google profile and sign-out controls. The old `/account#cloud-processing` link redirects to `/cloud` after sign-in. Stripe remains **test mode only** ($1.99/1 credit, $5.99/5 credits reference plans); no live money is accepted. Ordinary browser exports remain free and local.

Pricing selections return through an allowlisted Google OAuth destination to the selected billing plan. Selecting a plan on the public page does not start payment. New task/order listing endpoints use owner-scoped queries, fixed status filters and ten records per page; they reuse the existing sandbox schema and require no migration. The cloud preview shares the PDF geometry, preserves original pixel dimensions when showing a reduced preview and skips full local decoding above 24 MP. The original selected file, rather than its preview, is uploaded only after explicit consent.

Cloud jobs use private R2, a serial Queue consumer and an additive D1 job ledger. Starting atomically reserves one credit; a stored successful result consumes it once; failure/cancellation releases it. Owner-authenticated repeat downloads do not consume credits. Files expire after 24 hours, with cleanup/recovery scheduled every five minutes. Queued jobs persist independently of the browser, with leases, idempotency, bounded automatic retries and a 20-minute deadline.

Supported cloud inputs: RGB/grayscale JPG up to 20 MiB/100 MP, and 8-bit non-interlaced PNG up to 8 MiB/4 MP; 30,000 px per side; up to 400 poster sheets. No AI, WebP, professional PDF or batch cloud processing is included in this release. Upload requires explicit consent. The shared print engine also provides separate assembly and calibration PDFs. Account/API routes remain outside visitor analytics.

Apply `server/billing/migrations/0002_cloud_jobs.sql` **once to the existing sandbox database**, without resetting `0001` or existing orders. Resource bindings: `BILLING_TEST_DB`, private `CLOUD_TEST_FILES` bucket, `CLOUD_TEST_QUEUE`; flags `BILLING_TEST_ENABLED` and `CLOUD_TEST_ENABLED`. Live Stripe keys are rejected. Disable the flags and roll back the Worker to revert the UI/API while retaining the additive records; restore a database bookmark only after reconciling subsequent test transactions.

Local runtime integration: `node scripts/prepare-cloud-local.mjs` prepares an isolated fixture configuration and session under ignored `verification/cloud/`. Initialize the two migration files and generated `seed.sql` using **local** Wrangler D1, then run Wrangler dev with that config and persist directory. `node scripts/check-cloud-runtime.mjs` checks actual local D1/R2/Queue PDF delivery; set `CLOUD_JPEG_FIXTURE` to a supported large JPG fixture. `node tests/browser-cloud.mjs` checks explicit consent, server output download and mobile layout against that local runtime. These scripts do not grant remote credits or use real payments.

Browser-based poster tiling and PDF tools for **postertiler.com**. The formal application source is maintained locally in the PosterTiler project's `app` directory and published at this repository root.

## Features

- Image poster maker, exact physical dimensions, printer margins, overlaps, Framed Grid, cut guides and optional removable label bands.
- Poster size calculator, example gallery and printing guides.
- Multiple images to PDF, with ordering and rotation.
- Existing PDF page tiling, preserving supported source text, embedded fonts and vector resources.
- Life-size poster scaling from selected subject bounds.
- Halftone dots, monochrome error-diffusion dithering and a combined RGB CMYK-style effect.

The free tools run locally in the browser without an account, upload, payment or AI API. Optional cloud PDF processing uses the authenticated sandbox workspace. AI enhancement and image generation remain separate roadmap items.

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

The Worker handles `/api/*`, private account responses and `/cloud`; ordinary tool assets keep asset-first routing. Configure `GOOGLE_CLIENT_SECRET` and `AUTH_COOKIE_KEY` as Cloudflare **Secrets**. The cookie key must be a randomly generated 32-byte base64url value. `AUTH_ORIGIN` and the public `GOOGLE_CLIENT_ID` are configured in Wrangler. The exact Google redirect URI is `https://postertiler.com/api/auth/callback/google`. Do not put either secret in `VITE_` variables. Changing the cookie key invalidates existing sessions.

For local Worker development, copy `.dev.vars.example` to `.dev.vars` and use separate local credentials, or leave sign-in unavailable. Run `npx wrangler dev --port 4181`; the example local origin is `http://127.0.0.1:4181`. Unit tests use generated signing keys and a fixture provider; `node tests/browser-auth.mjs` tests UI states with explicitly mocked responses, not a real Google account.

The public domain is `postertiler.com`. `src/tracking-config.json` contains public GA4, Clarity, Ahrefs Web Analytics, Shipsolo/Plausible and Bing verification identifiers; `build:release` applies them. These are browser tag identifiers, not server API credentials. A normal local build keeps optional analytics unconfigured. `.env.example` lists available overrides.

All four visitor providers require explicit analytics acceptance. Account/cloud/API/unknown paths and nonproduction hosts are excluded. Public pricing can be measured only after analytics acceptance. Clarity masks file editors, previews and account navigation. Tags that inspect their own URLs/referrers are excluded on parameterized or unsafe contexts; GA4 uses explicit sanitized page fields. Withdrawal clears controlled analytics cookies and reloads the page. The expanded provider list uses a new consent version, so a former GA4-only acceptance is not reused. GSC uses existing DNS ownership verification; Bing uses the public meta verification tag.

## Stripe sandbox integration

The `/api/billing/test/*` routes implement test Checkout, signed snapshot webhooks and persistent test order/credit records in the separate `BILLING_TEST_DB` D1 database. This is a sandbox integration, not live billing. Optional cloud processing uses only these test credits. `BILLING_TEST_ENABLED` defaults to `false`; checkout stays unavailable until explicitly enabled with all bindings and secrets. No live key is accepted. The two candidate Price IDs in `server/billing/catalog.mjs` are verified against Stripe for test mode, USD, one-time billing and the expected 199/599 cents before a checkout is created.

Required encrypted server Secrets: `STRIPE_TEST_SECRET_KEY` and `STRIPE_TEST_WEBHOOK_SECRET`. Apply `server/billing/migrations/0001_billing_test.sql` only to the named test database. The HTTPS endpoint is `/api/billing/test/webhook`; subscribe to snapshot events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` and `charge.refunded` using API version `2026-10-28.endive` for Stripe 23.1.0. Store the endpoint's `whsec_` signing secret in Cloudflare, never in client variables or source control.

Endive Checkout uses `allowed_payment_method_types: ['card']` as a filter on Dashboard-enabled methods. The older `payment_method_types` create parameter was removed in the September 2026 API release. Sandbox setup errors expose only safe categories and short reasons with credentials, URLs, email addresses and opaque identifiers redacted. Real Stripe sandbox payments for both USD 1.99 and USD 5.99 previously granted six test credits. Version 1.7 separates billing and the cloud workspace for cloud-task acceptance; live money remains disabled.

The handler reads the raw body, verifies the signature using the official Stripe SDK and Web Crypto, retrieves canonical Stripe objects, verifies the purchased price/amount/owner and updates the event and order atomically. Repeated/delayed events cannot duplicate credits or restore refunded credits. Returning to `/account` only reads persisted state. Checkout idempotency keys survive uncertain API responses; request rate and body size are bounded. No file or Google email/name is sent to Stripe by this implementation; the client reference is a SHA256 pseudonymous Google subject reference.

Run `node --test tests/billing.test.mjs tests/cloud.test.mjs` and `npm run test:browser:billing`. Backend tests use actual SQLite and the real SDK's signature verifier with a fixture Stripe API. The separate cloud runtime checks exercise actual local workerd, D1, R2 and Queues. Live payments require separate production data/resources, verified live merchant configuration, tax/refund terms and final acceptance before real sales.

## Limits and evidence

Each tool shows its supported file, pixel and page limits. PDF layers, forms, encryption and printable annotations have explicit restrictions. CMYK-style output is combined RGB artwork, not prepress color-separation plates. Print at Actual Size / 100%; physical printing and assembly are separate user acceptance steps.

Third-party notices are retained in `third-party-licenses` and test fixtures. Public repository visibility does not grant a license to third-party trademarks, brand artwork or source material.
