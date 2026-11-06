# AI pilot (v1.11)

This implementation adds optional Topaz Precision enhancement and GPT Image 2 generation/editing. Ordinary local PDFs and cloud-export credits are unchanged. The deployed pilot is enabled only for the explicitly invited Google account(s) in the private allowlist; local example configuration remains disabled. Stripe remains sandbox-only.

## Configuration

1. Apply `server/billing/migrations/0003_ai_test.sql` to the existing, explicitly verified **test** D1 binding `BILLING_TEST_DB`. It adds independent AI tables and does not alter cloud tables. Take a database export before remote migration; never substitute a live-money database.
2. Store `FAL_KEY` and `AI_TEST_ALLOWED_EMAILS` as Cloudflare Secrets. The latter is a comma-separated list of verified Google sign-in emails invited to this pilot. Do not commit either value.
3. Existing `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, private `CLOUD_TEST_FILES` and `CLOUD_TEST_QUEUE` bindings are reused. The existing `/api/billing/test/webhook` dispatches signed AI events by server-created metadata. No second webhook or manually copied Price IDs are required: inline one-time prices come exclusively from the server catalog.
4. Only after configuration, output validation and a deliberate provider-spend decision, change the versioned `AI_TEST_ENABLED` setting to `true`. The owner approved a private pilot on 2026-11-06; the versioned setting is now `true`. Keep the allowlist private and non-empty. `AI_DAILY_BUDGET_CENTS` defaults to 500 **budget cents per rolling day**, not measured vendor spend. fal is a real paid inference service even when payment uses test cards; the pilot allowlist prevents arbitrary visitors from consuming it. Enabling the flag does not itself submit a provider task.

No actual provider calls are part of the automated tests. Live-money entitlements, sales, tax/refund configuration and public AI access require a separate rollout; do not remove the pilot guard and call it production billing.

## API and jobs

`/api/ai/test/capabilities` exposes only the current visitor's availability and public limits. Other AI routes authenticate a session, check the pilot allowlist, apply resource ownership and enforce exact-origin mutations.

- `GET /status`: balances and latest 20 tasks.
- `POST /jobs`: fixed validated spec, request UUID and explicit processing consent; reserves 3/8/16 AI credits atomically.
- `PUT /jobs/:id/source`: bounded, hash-verified JPEG working copy for edit/enhance. Generation has no image upload.
- `POST /jobs/:id/cancel`: prevents later result delivery and releases reservation; provider cancellation is best-effort.
- `GET /jobs/:id/download`: owner-only verified PNG; repeat downloads do not consume credits.
- `/billing/{status,checkout,orders,orders/:id,webhook}`: separate sandbox AI orders and Stripe fulfillment.

Only one active task per owner; at most 12 new tasks/hour. Source upload is bounded to 8 MiB. Results are PNG, at most 32 MiB/24 MP/12,000 px per edge, and must match the quoted dimensions. PNG decompression is validated as a stream before storage and debit. Existing browser PNG/effect limits remain in force.

`awaiting_upload -> queued -> submitting -> processing -> succeeded` is the normal path. Failed/canceled jobs release credits; successful jobs consume once. A submission lease is recorded **before** the potentially paid POST. An unknown submit response is not automatically retried. Poll/download recovery retains the provider request ID. Queue messages redrive polling; scheduled maintenance recovers lost publications and expired leases.

R2 keys are isolated under `ai-test/`. Website copies expire 24h after task creation. Cleanup removes prompt text and provider URLs as well as files, while retaining minimal order/task/credit history. Provider submissions request `X-Fal-Store-IO: 0` and a one-hour CDN lifetime; these are not an end-to-end zero-retention guarantee.

## UI and output

- Private `/account/ai` studio with creation, editing, enhancement, balance, task results and one-time pack purchases.
- Existing editor: **Image adjustments -> AI tools**. Explicitly apply the result or return to the original. Local colour/effects run after the selected AI working image. Physical print settings remain intact.
- AI PNG dimensions are used by preview/PPI and embedded into the PDF, including after local colour adjustment. A larger pixel count does not prove restoration of real source detail.
- Pricing: $4.99/40 AI credits and $9.99/100. Enhance/standard: 3; high-quality: 8; 4K high-quality: 16. Cloud-export balances cannot be spent as AI credits.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build:release`, and `npm run test:browser:ai` against the local preview (default `http://127.0.0.1:4192`, configurable with `AI_TEST_ORIGIN`). Browser API/model/Stripe responses are explicit fixtures; actual PDF export and embedded dimensions are checked. This does not establish real fal quality, account availability, provider charges, or real Stripe AI Checkout success.

Provider references: [queue](https://fal.ai/docs/documentation/model-apis/inference/queue), [Image 2](https://fal.ai/models/openai/gpt-image-2/api), [Topaz](https://fal.ai/models/topaz/upscale/image/precision/api), [retention](https://fal.ai/docs/documentation/model-apis/media-expiration).

## Sightengine safety review (v1.11.5)

Required encrypted Worker secrets: `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET`. Use the existing free account; no subscription upgrade or paid overages are part of this release. Missing credentials disable new AI tasks. Free local tools remain local. The existing single-account pilot and Stripe test mode remain enforced. No schema migration is required.

New jobs require versioned `moderation_consent` in addition to upload permission. Older queued tasks without this permission fail and release reserved credits; they are not silently transmitted to a new processor. Previously successful private pilot downloads retain their original 24-hour availability and are not retroactively sent to Sightengine.

Before a paid fal submission, the worker reviews prompts and actual uploaded JPEGs. It retains fal's safety parameter. After verified model output returns, the worker derives a review PNG from the actual output, screens it, then stores/delivers the original PNG and debits credits. Output review is required for all three AI tools. Review copies have a maximum 1024-pixel edge and white-flattened transparency; a streaming decoder avoids allocating a full 24 MP RGBA image. They never replace the original download. Missing/invalid scores, malformed responses, redirects, timeouts, quota limits and service failures cannot authorize delivery. Raw responses, matched text, credentials and private URLs are not logged.

Image models: `nudity-2.1,gore-2.0,violence,self-harm,offensive-2.0` (3 visual operation groups). Site policy blocks scores >= 0.5 for sexual activity/display, erotica/very suggestive content, gore, physical violence/firearm threats, self-harm and Nazi/supremacist/terrorist symbols. Traditional Asian swastikas, combat sport scores and ordinary swimwear alone are not rejection rules. False positives and false negatives remain possible; thumbnail review can miss small details. These models are not specialist CSAM hash matching, age/identity proof or a copyright/legality detector.

Prompt rules cover the documented languages, including Chinese. Non-East-Asian-script prompts also use the English ML `general,self-harm` classifier. Semantic coverage is limited outside English. Chinese/mixed East Asian prompts do not receive unsupported semantic ML classification; they still receive rules, model-side safety and image output review. Other languages can have limited coverage. No translation or unselected moderation provider is called.

The documented free plan allows 2,000 operations/month, 500/day and 1 request/second. Model groups consume operations; this is not 2,000 images. Calls within a task are paced at 1.1-second intervals. Cross-isolate rate-limit responses fail closed. There is no automatic moderation retry, fallback provider or account upgrade. Output review can fail after fal incurs a cost; releasing website credits does not refund provider charges.

Passing checks are recorded as policy version plus input fingerprint/output hash in private job metadata. No new table is needed. Existing leases, cancellation, atomic submit/credit accounting, ownership and expiry remain enforced. Browser specs cannot supply review proofs. Failed checks release the reservation, with no unchecked preview, download or apply action for that new job.

Pilot operator connection check: open `/api/ai/test/moderation-check` while signed into the invited account and submit the fixed-input form. It reviews a benign prompt, the public alpine example and a fixed rejected text. It never calls fal or mutates balances. Uses free moderation operations; one run/minute/worker instance, no arbitrary inputs, exact-origin POST and private/no-store/noindex responses. GET does not call Sightengine. Do not broaden this diagnostic beyond the single-account pilot.

References checked 6 November 2026: [pricing](https://sightengine.com/pricing), [operations](https://sightengine.com/faq/what-is-an-operation), [image models](https://sightengine.com/docs/getstarted), [prompt rules](https://sightengine.com/docs/text-moderation-rule-based), [ML](https://sightengine.com/docs/text-moderation-ml-models), [languages](https://sightengine.com/faq/languages-for-text-moderation).
