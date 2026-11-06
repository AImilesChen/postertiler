# Privacy Policy

Effective date: 6 November 2026

## Operator and contact

PosterTiler is operated by **mileschen**, an individual based in **Mainland China**, trading as PosterTiler. For support, privacy questions and requests about your information, contact **[support@postertiler.com](mailto:support@postertiler.com)**.

## Images, PDFs and local processing

The free tools process your selected images and PDFs in your browser. They use file contents, dimensions, orientation, page information and your settings to prepare previews and downloadable files. The tools do not upload these files to PosterTiler, Cloudflare, Google or an AI service. No account is required.

This includes image poster tiling, multi-image PDF merging, PDF page tiling, subject-bound selection for life-size posters, halftone effects and the size calculator. The image effects run on your device without an AI API.

Source files and working previews are held temporarily by the open page, rather than saved to persistent browser storage by the application. Closing or reloading the page discards the working state. Downloaded files remain wherever you save them; we cannot delete your own copies.

PDF tiling reuses source page content and resources. It is not a PDF sanitization service. Remove private information and unwanted content before using or sharing a source file. Sending an attachment to support is a separate, voluntary disclosure to us.

## Optional cloud PDF sandbox and test payments

The Cloud PDF workspace and Account pages offer optional cloud PDF processing with Stripe sandbox credits. No real money is charged in this release. Only the cloud form, or a separately confirmed AI task described below, uploads a file; the cloud form does so after you explicitly select the upload-consent checkbox and start the task. Ordinary local tools remain local.

For a cloud task, Cloudflare Workers, Queues, D1 and private R2 storage process the selected JPG or PNG, its byte hash, dimensions and confirmed print settings to produce a PDF. Source files may contain EXIF or other metadata; remove private information before uploading. We remove JPEG metadata segments and PNG ancillary metadata from the embedded output image and respect supported EXIF orientation. This is not a content-sanitization or professional color-proofing service. Files are not public, are not used for AI training or promotion, and no AI provider is called.

File access ends 24 hours after task creation. A scheduled cleanup normally deletes source and result objects within the next 5 minutes, and retries after service outages. Keep your downloaded copy; we cannot delete it from your device. Temporary storage may be processed outside your country. Cloudflare's global processing and security practices apply.

We keep a pseudonymous reference derived from your Google account identifier, Stripe test order/payment references, price and credit amounts, job settings, file hashes, statuses and timestamps in D1. These records support ownership checks, duplicate-request protection, credit reservations, delivery and failure recovery. They are separate from the temporary files and do not automatically disappear after 24 hours. In this sandbox they remain until the test data is reset or a supported deletion request is handled; do not upload sensitive personal files for testing.

Test checkout sends Stripe the plan, amount and pseudonymous order/account reference. Stripe collects the test checkout details you enter under its [Privacy Policy](https://stripe.com/privacy). Use only Stripe test card data. We do not receive or store card numbers. Account and cloud API routes are excluded from visitor analytics, including file names, job identifiers and download links. Contact support@postertiler.com for data requests.

## Optional Google sign-in

You can choose to sign in with Google. We request only your basic identity information: Google's account identifier, verified email address and display name. Google authenticates you under its own [Privacy Policy](https://policies.google.com/privacy). We do not receive your Google password or request access to Gmail, Drive, contacts or calendars.

Our Cloudflare Worker uses this information to verify your identity and maintain your requested sign-in. The current version does not create a permanent account database or save Google access or refresh tokens. Your basic profile is held in an encrypted, HttpOnly first-party session cookie for up to 7 days, then expires. Signing out removes the session cookie on that browser. Other browsers have separate sessions. A temporary security cookie for an authentication attempt expires after 10 minutes and is removed when the callback is handled.

Signing in does not upload your poster files or enable analytics. You can use all free tools without signing in. Clearing the session cookie removes the profile stored by this release on that browser; downloaded files, support correspondence, Google's own records and hosting/security records are separate. See the [Cookie Policy](/cookies). The legal basis, where applicable, is providing the sign-in you request, together with our legitimate interests in authenticating securely and preventing misuse.

## Website delivery and security

Cloudflare delivers and protects the website. Website requests involve technical information such as IP address, request time, browser information and security events. Cloudflare processes this information to deliver pages and protect its infrastructure and our website.

The poster application does not operate an additional visitor database or custom application-log store. Optional cloud files and pseudonymous task/payment records are described above. Hosting and security records are handled by Cloudflare under its service settings and [Privacy Policy](https://www.cloudflare.com/privacypolicy/). These infrastructure records are separate from your locally processed poster files. We do not sell personal information or use this release for behavioral advertising.

## Browser storage and analytics

We offer optional visitor analytics through **Google Analytics 4**, **Microsoft Clarity**, **Ahrefs Web Analytics**, and **Shipsolo's hosted Plausible service** at `plausible.shipsolo.io`. We load these services only after you accept analytics. Before a choice, after refusal, and on account and cloud workspace pages, the application does not load their tags or send their visitor measurements. Refusing analytics does not affect the free tools or sign-in.

GA4 measures visits and allowlisted actions such as starting a poster, completing settings, preparing a PDF, cancellation and errors. Events use public page paths and limited settings such as paper type and sheet count. PDF preparation is not evidence of saving, printing or successfully assembling it. We do not set an analytics user ID or send your Google profile. Google advertising storage, advertising personalization and Google signals are disabled in our tag configuration. See [Google's privacy information](https://policies.google.com/privacy).

Clarity provides masked interaction recordings and heatmaps to help understand navigation and layout problems. The file editors, previews and account navigation are explicitly masked, including their images and displayed file details. We do not identify you to Clarity. Its advertising-storage consent is denied. See [Microsoft's privacy statement](https://privacy.microsoft.com/privacystatement) and [Clarity's masking explanation](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-masking).

Ahrefs and Shipsolo/Plausible provide aggregated traffic and event reports. Our integration does not use their services to store poster files or persistent application accounts. They receive technical request information, public page locations and permitted interaction events; the providers process network metadata such as IP address and browser information under their own practices. See [Ahrefs Web Analytics data information](https://help.ahrefs.com/en/articles/10247870-about-ahrefs-web-analytics). Shipsolo operates the supplied Plausible endpoint; this is distinct from Plausible's own cloud hosting.

Tags that independently read page addresses and referrers are omitted on parameterized addresses and contexts we cannot safely classify. All visitor tags are excluded from account, API and unknown/private paths. Tool events do not include images, PDFs, original file names, Google identity information, support messages, private object URLs or download tokens. The Clarity masking and these exclusions are separate from your ability to use the local tools.

If you make a choice in Cookie settings, the application saves that preference in localStorage for 180 days. You can remove it through your browser or change it in the footer. An older GA4-only choice does not authorize the newly added providers. Withdrawal removes analytics cookies under our control and reloads the page to unload third-party code; it does not erase information already held by a provider. Provider-side report and recording retention follows the relevant account settings and service practices; contact us about deletion requests. See the [Cookie Policy](/cookies).

Google Search Console and Bing Webmaster Tools are used for public-page verification, Sitemap submission and search visibility reports. Their verification records do not install visitor recordings or upload your poster files. A verified site or accepted Sitemap does not guarantee search indexing or rankings.

## Optional AI processing sandbox

AI creation, single-image editing and resolution enhancement are separate optional services. They are disabled by default until configured, and are identified as sandbox features when enabled. Selecting a file, using free colour adjustments or signing in does not start an AI request.

After you confirm the AI disclosure and start a task, we send your prompt and, for editing or enhancement, a JPEG working copy of the selected image to fal and the selected model provider. GPT Image 2 is used for creation/editing and Topaz Precision for enhancement. Editing working copies are limited to a 1536-pixel edge and 1.6 megapixels; transparent inputs are flattened onto white. We do not send your Google name or email to the model. The provider receives the request through our server, rather than directly from your browser.

Our private Cloudflare storage holds the working image and result for up to 24 hours from task creation. Prompt text and provider URLs are removed when the expired task is cleaned up. Account references, task state, parameters, credit debits/releases and order records are retained to operate the service, reconcile usage and resolve problems. Downloading or applying the result does not publish it in the Gallery.

We request that fal omit inputs and outputs from its request-history payload storage, and request a one-hour expiration for generated CDN files. These controls are not a promise of zero retention across model providers, security logs or other processing. See [fal data retention controls](https://fal.ai/docs/documentation/model-apis/media-expiration) and [fal Privacy Policy](https://fal.ai/legal/privacy-policy). Processing may occur outside your country. Do not submit confidential information or images you lack permission to share with these providers.

AI processing permission is separate from analytics permission. Refusing analytics does not prevent a requested AI task. When you use an AI result in the poster maker, its local working preview stays in page memory; downloaded copies remain on your device. AI credits, Cloud PDF credits and their sandbox order histories are kept separately. No real-money AI checkout is enabled in this release.

## Support email

If you contact us, we receive your email address, message, headers and any attachments you choose to send. We use these to respond, investigate the problem and handle related privacy or rights requests. Sending your original image is optional; start with a description of the problem.

Our self-hosted Agentic Inbox mailbox uses Cloudflare email services, Workers, Durable Objects and R2 storage. The mailbox also has Cloudflare Workers AI assistance that may process support correspondence to prepare reply drafts. This is separate from the poster tools: selecting a file in a tool does not send it to the mailbox or its assistant. Do not email passwords, payment card details or unnecessary sensitive information.

Support correspondence has no automatic expiry in the mailbox. It remains until manually deleted. We retain correspondence for handling the request, necessary follow-up, disputes and legal obligations, and review deletion when those purposes no longer apply or you make a deletion request. We do not promise an automatic 24-hour deletion period for email.

## Purposes, locations and legal bases

We use information to deliver and secure the website, answer messages you initiate and comply with applicable obligations. Where EEA or UK data-protection rules apply, the relevant grounds are our legitimate interests in operating and protecting the website and responding to requested support, performance of a requested service where applicable, and compliance with legal obligations. The optional visitor analytics described above uses your consent, which you can withdraw.

The operator is in Mainland China and Cloudflare and the analytics providers operate internationally. Website, optional analytics and support information may be processed outside your country. Cloudflare describes its processing and relevant transfer safeguards in its [Data Processing Addendum](https://www.cloudflare.com/cloudflare-customer-dpa/); the analytics providers describe their practices in the linked information. This does not change the local processing of files you select in the free tools.

## Your rights and choices

Depending on applicable law, you may request access, correction, deletion, restriction or a copy of information, or object to relevant processing. Contact support@postertiler.com and describe your request. We may ask for proportionate information to identify the relevant correspondence; please do not send an identity document unless we explain why it is needed and how to provide it safely.

Rights and exceptions depend on the circumstances and applicable law. You may also contact the data-protection authority competent for your location. We cannot retrieve or erase files that only exist on your own device.

## Minors and changes

This is a general-purpose printing tool. Minors should use it with the involvement and permission of a parent, guardian or responsible educator as required by applicable law. The tool does not request dates of birth or children's profiles. Contact us if a child's personal information has been included in support correspondence and needs attention.

We will update this policy when the service or data practices change and show the effective date above. Changes to live payments, account records, cloud processing or AI services will be reflected in this policy before they become available.
