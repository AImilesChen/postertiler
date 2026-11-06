# AI pilot (v1.11)

This implementation adds optional Topaz Precision enhancement and GPT Image 2 generation/editing. Ordinary local PDFs and cloud-export credits are unchanged. AI remains **disabled by default**, and Stripe remains sandbox-only.

## Configuration

1. Apply `server/billing/migrations/0003_ai_test.sql` to the existing, explicitly verified **test** D1 binding `BILLING_TEST_DB`. It adds independent AI tables and does not alter cloud tables. Take a database export before remote migration; never substitute a live-money database.
2. Store `FAL_KEY` and `AI_TEST_ALLOWED_EMAILS` as Cloudflare Secrets. The latter is a comma-separated list of verified Google sign-in emails invited to this pilot. Do not commit either value.
3. Existing `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, private `CLOUD_TEST_FILES` and `CLOUD_TEST_QUEUE` bindings are reused. The existing `/api/billing/test/webhook` dispatches signed AI events by server-created metadata. No second webhook or manually copied Price IDs are required: inline one-time prices come exclusively from the server catalog.
4. Only after configuration, output validation and a deliberate provider-spend decision, change the versioned `AI_TEST_ENABLED` setting to `true`. `AI_DAILY_BUDGET_CENTS` defaults to 500 **budget cents per rolling day**, not measured vendor spend. fal is a real paid inference service even when payment uses test cards; the pilot allowlist prevents arbitrary visitors from consuming it.

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
