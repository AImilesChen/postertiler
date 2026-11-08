# Cookie and Analytics Policy

Effective date: 8 November 2026

PosterTiler is operated by **mileschen**, an individual based in **Mainland China**. Contact **[support@postertiler.com](mailto:support@postertiler.com)** with privacy questions.

## Current browser storage

Optional first-party analytics also use `__Host-postertiler-metrics`, a signed HttpOnly cookie lasting up to 30 days, and `postertiler-metric-session` in sessionStorage, refreshed during consented use with a 30-minute session timeout. These identify consenting browsers/sessions for approximate daily traffic and active-time reports, not verified people. They are not used for advertising. Rejecting analytics clears this cookie/session identifier and stops reporting. The consent preference is now `postertiler-analytics-consent-v3`; older choices do not opt you into the added measurement.

The free tools process selected images and PDFs in your browser. Ordinary source files and previews are not saved to persistent browser storage. Choosing to prepare a gallery submission can save a separate local draft as described below. Files you download remain wherever you choose to save them.

| Storage | Identifier | Purpose | Lifetime | Provider |
|---|---|---|---|---|
| IndexedDB | `postertiler-gallery-draft` | Preserve a gallery draft you choose to prepare | Expires after 24 hours; discarded on next access, submission or explicit discard | PosterTiler |
| localStorage | `postertiler-analytics-consent-v3` | Remember a choice covering first-party measurement and the four optional analytics providers | 180 days after the latest choice, or until you clear it | PosterTiler |
| HttpOnly, Secure, SameSite=Lax cookie | `__Host-postertiler-oauth` | Protect a Google sign-in attempt with state, nonce and PKCE | Up to 10 minutes; removed when the callback is handled | PosterTiler |
| HttpOnly, Secure, SameSite=Lax cookie | `__Host-postertiler-session` | Hold the encrypted basic profile for the sign-in you requested | Up to 7 days, or until sign-out or browser deletion | PosterTiler |

The sign-in cookies are necessary for the optional login you request and are separate from analytics consent. They are created when you start or complete sign-in, not when you use an anonymous free tool. Blocking these cookies prevents sign-in; the free tools remain available. Google may use its own cookies on Google's authentication pages under its own policies. We do not load a Google sign-in tracking script on the anonymous tool pages.

Cloudflare delivers and protects the site and may use infrastructure cookies when its security features require them; these do not contain your selected poster files. See [Cloudflare's cookie explanation](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/).

## Optional visitor analytics

We load the following services only after you accept analytics. They are excluded from account, API and unknown/private pages. Tags that read their own page/referrer addresses are also omitted on parameterized or unsafe contexts.

| Service | Purpose and storage |
|---|---|
| Google Analytics 4 | Visit and permitted tool-event reporting. May set `_ga` and `_ga_…` first-party cookies; our tag sets a 180-day cookie expiry. Advertising storage, personalization and Google signals are disabled. |
| Microsoft Clarity | Masked interaction recordings and heatmaps. File editors, previews and account navigation are explicitly masked. Analytics consent is granted only after your acceptance; advertising storage remains denied. Clarity may set `_clck` and `_clsk` to connect visits and recordings; expiration and other Microsoft technical cookies depend on the provider's current settings, consent signals and browser restrictions. |
| Ahrefs Web Analytics | Aggregated traffic and event reporting. Its analytics product does not use visitor cookies or persistent identifiers; our integration still requires acceptance. |
| Shipsolo/Plausible | Traffic and event reporting through `plausible.shipsolo.io`. The supplied tracker does not set visitor cookies. We require acceptance and use manual pageviews with public canonical addresses. |

Cookie lifetimes can be shortened by browser settings or deletion. Removing a browser cookie does not erase earlier provider-side reports. Clarity recordings and analytics report retention are controlled by the relevant account/service settings. See [Clarity's cookie documentation](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-cookies), [Ahrefs' data explanation](https://help.ahrefs.com/en/articles/10247870-about-ahrefs-web-analytics), and [Google's privacy information](https://policies.google.com/privacy).

## Your choice

Open **Cookie settings** in the footer to review or change the stored preference. Rejecting analytics does not affect image selection, settings, local processing, PDF downloads or Google sign-in. A previous GA4-only preference is not reused as consent for the expanded provider list.

Before a choice or after rejection, these tags and measurements are blocked. Withdrawal saves rejection, stops application events, requests denied Clarity storage consent, removes analytics cookies under our control and reloads the page to unload third-party listeners. Other active PosterTiler tabs with analytics also reload in response to the changed stored preference. Download work you want to keep before withdrawing: a reload discards unsaved editor state. Withdrawal does not automatically erase earlier data held by a provider or delete third-party cookies outside our domain.

You can clear localStorage and cookies through your browser. Clearing storage removes the saved preference and may cause the site to ask again when analytics is enabled.

## Search measurement and excluded data

Google Search Console and Bing Webmaster Tools check indexing and search performance of public pages. They are separate from visitor analytics and require no visitor tracking consent merely to verify this website or submit its public Sitemap. We do not submit private poster files or download tokens for indexing.

Our tool events exclude source images, PDFs, original file names, email addresses, support messages and private download links. Clarity uses explicit masking for file-related page content. Preparing a PDF is not recorded as proof of successful physical printing.

For more information and requests, read the [Privacy Policy](/privacy) or email support@postertiler.com.

## Optional gallery drafts

When you choose Submit to Gallery from a PDF result, the browser can save a prepared image and print settings in IndexedDB (`postertiler-gallery-draft`) to preserve the draft through sign-in. This is functional storage, separate from visitor analytics. It expires after 24 hours and is discarded when next accessed; submitting or choosing Discard local draft removes it. It is not uploaded until you confirm and submit the gallery form.
