# PosterTiler

Version 1.10.2 refines the **Size reference** in the poster editor's Original preview. A generated natural-profile silhouette now appears by default as a very pale background reference, aligned to the poster top. The poster determines the fitted view; the 180 cm figure uses the same millimetre scale and can extend beyond the clipped preview. Transparent asset margins are excluded from the height calculation. The small person icon beside zoom/fullscreen toggles visibility. Printed Sheets and PDF output remain independent of the reference artwork.

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


## Local image dithering

`/tools/dithering-tool` is a free browser-only workspace with Floyd–Steinberg black-and-white, Bayer ordered and deterministic Noise algorithms. Four presets, RGB colour quantisation and custom two-tone palettes share a validated worker. Grain is measured against the selected output dimensions. PNG downloads and poster import use the same rendered Blob; the poster editor does not apply the effect again. Inputs retain the existing 32 MB / 24 MP / 12,000 px limits. Optional downscaling never enlarges the source. No fal, uploads, account or credit reservation is involved.

Examples and source provenance are in `public/assets/dither-examples`. Artwork sources are The Met Open Access, with processed examples generated using the local effect implementation. Private working images remain in page memory; reloading clears the session. Consent-based analytics for this workspace use explicit safe events and suppress automatic DOM recording tags.


## Printing guides and preparation

`/guides` includes a beginner walkthrough, problem-based shortcuts, eight searchable guides and paper-specific calibration/checklist downloads. Search includes descriptions, article text and curated aliases; `scale`, `100%`, `blurry` and `white border` resolve to relevant guides. The original five article URLs remain unchanged. New articles cover margins/overlap, Fit/Fill and paper/orientation. Desktop articles have a sticky contents list; mobile articles use an expandable contents list.

The calibration preview in `public/assets/guides` is rendered from the actual print engine PDF. It is labelled as a preview, not a print-scale template. Calibration and checklist downloads support A4, US Letter and A3 in portrait or landscape. Actual user assembly maps remain in the poster export flow. No payment, AI processing, external upload or new tracking provider is required.

## PDF sharing and community gallery

Local poster, life-size/halftone, image-to-PDF and PDF-poster outputs open a PDF-ready dialog with an editable safe file name, repeat download and device file sharing. File sharing uses `navigator.canShare({files})` and a user-triggered `navigator.share`; cancellation is a normal result and opening a native menu is not a recipient-delivery receipt. Unsupported browsers keep the download path. No gallery upload happens merely by generating, downloading or sharing a local PDF.

`/gallery` separates generated examples, reviewed digital artwork and contributor print photos. `/account/submissions/new` accepts an explicit opt-in project upload; `/account/submissions` lists only the signed-in contributor's records. `/account/gallery-review` is restricted by the server-only `GALLERY_ADMIN_EMAILS` Secret (an exact email allowlist, never committed to the repository). Unconfigured accounts receive no moderation role. A rights statement, image/text checks and a manual review are required before publication. Public details at `/gallery/<UUID>` and `/sitemap-gallery.xml` include approved records only. Withdrawal disables future public API access without leaving permanent object URLs behind.

Gallery resources are independent of sandbox billing: D1 binding `GALLERY_DB` / database `postertiler-gallery` and private R2 binding `GALLERY_FILES` / bucket `postertiler-gallery`. Initial schema is `server/gallery/migrations/0001_gallery.sql`; no existing billing or cloud table is migrated. Set `GALLERY_ENABLED=true` only with schema and bindings ready. Reuse the existing Sightengine Secrets for checks; gallery code never calls fal or debits AI/Cloud PDF credits. `keep_vars` preserves existing dashboard-managed runtime configuration. Do not enable public R2 bucket access or give users a direct bucket URL.

The JPEG publication copy is prepared in the browser (maximum side 3000 px, 8 MP, 8 MiB), then server-validated, stripped of metadata and checked. Print-photo and artwork bytes are checked separately. A public PDF is rebuilt from the checked artwork and validated print settings during approval; arbitrary PDF uploads cannot be published. Display, personal remix and PDF permissions are independent; display-only is not copy protection. Public PDF copies can differ in resolution/file size from the original local export. No payment is required from the contributor.

Intake limits are atomic: 5 submissions per contributor/day, 3 active reviews per contributor, 20 total/day, 100 per rolling 30 days and 1000 active/public entries; up to 100 poster sheets. Limits bound early storage and moderation use but do not guarantee zero provider charges. Duplicate request IDs do not run checks again; ambiguous client failures should retry with the same unchanged draft. Unavailable/blocked checks fail closed. The existing five-minute scheduled maintenance expires pending projects after 30 days, removes withdrawn files, removes rejected/check-error files after 7 days and removes closed records/audit/resolved reports after their documented retention. Open reports stay until resolved. Existing downloaded copies cannot be recalled.

Verification includes SQLite tests, actual workerd D1/R2 + HTMLRewriter tests, PDF geometry checks and in-app-browser acceptance. `verification/gallery-release/fixture-server.mjs` is a local-only mocked-moderation UI fixture, excluded from source deployment. It must never be exposed remotely or substituted for real authentication/moderation. To verify release prerendering, run `npm run build:release` then `$env:POSTERTILER_TEST_RELEASE='true'; npm test` in PowerShell. Private submission/review pages remain noindex and outside the public Sitemap. GSC/Bing/analytics setup is unchanged.
# Printed assembly labels

New poster jobs enable printed labels by default (including bundled examples, PDF tiling and Cloud PDF). Each sheet prints its position, global page count and a TOP arrow in a removable 5 mm guide band outside the artwork and printer margins. PDF-source jobs also identify the source page, such as P2-A1. The shared geometry reserves this band before preview, size and sheet-count calculations. Exact finished dimensions remain exact and may need additional sheets. Legacy shared/saved settings retain an explicit labels=false choice; Image to PDF is not a tiled poster and keeps its existing behavior. Existing downloaded PDFs and published gallery PDFs are not rewritten.

The preview, review step and download dialog show the current printed-label state. Users can disable labels in Print Options; the download dialog links back to those options. Regression coverage is in tests/print-labels.test.mjs.

## Feedback and operations backend

`/feedback` accepts voluntary, private feedback; `/account/feedback` shows only the signed-in owner's messages and public replies. Optional screenshots are normalized, metadata-stripped JPEGs in private R2. Neither source files nor prompts are attached automatically. Server rate limits, a honeypot and idempotent request IDs are always enforced. Turnstile is supported when both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are configured; verification is server-side and fails closed. The feedback footer, PDF-ready dialog and editor error state link to this flow.

`/admin` and its subpages require the existing exact `GALLERY_ADMIN_EMAILS` allowlist at the server and show private no-store/noindex responses. They include overview, the existing Gallery review, feedback, account records, test orders, refund requests, consented traffic, task anomalies, audit logs and configuration status. Private notes and support replies have different fields. Revision checks prevent overwriting concurrent edits. Archive is reversible. No admin action in this release issues a Stripe refund, changes a balance or reruns a paid AI task.

Apply `server/gallery/migrations/0002_operations.sql` once to the existing `GALLERY_DB` before publishing this code. It adds only `ops_*` tables and indexes, without changing existing gallery/billing/credit tables. Keep the bucket private. The migration is idempotent. Rollback the Worker to the previous deployment to disable these routes; leave additive tables intact to preserve support records. Do not drop production data as part of rollback.

First-party metrics require the renewed v3 analytics choice and use signed anonymous browser identity, trusted country-level edge metadata, public paths, coarse sources, allowlisted events and foreground active time. Admins and recognizable bots are excluded. No raw IPs, filenames, private URLs, messages or prompts enter metric records. Reports are estimates, use UTC and start at enablement; historical registration/payment dates are not invented. GA4 browser tags remain in place; its reporting API is intentionally not connected. Live revenue stays unavailable while Stripe is in test mode. Actual provider cost is unavailable; AI task budget ceilings are labelled as ceilings.

Feedback saving does not depend on mail. The optional Resend adapter requires `RESEND_API_KEY`, a verified sender address in `OPS_EMAIL_FROM` and destination `OPS_NOTIFY_EMAIL`. Missing credentials are shown as not configured. An existing receive-only email-routing rule does not provide sending capability. Outbox delivery uses idempotency, bounded retries, leases and a manual retry after attention status. Do not test this adapter against real recipients without authorization. The five-minute maintenance task retries notifications and enforces documented metric (90 days), pulse deduplication (7 days), audit (one year) and closed-feedback (one year) retention.

`tests/operations.test.mjs` exercises actual SQLite queries and privacy/ownership/revision boundaries. `tests/operations-runtime.test.mjs` checks workerd D1 and private routing; `tests/site-metrics.test.mjs` checks consent, hidden/idle pages and withdrawal. Local fixture servers in `verification/` must never be deployed or replace production authentication. Production acceptance does not require AI calls or financial transactions.

