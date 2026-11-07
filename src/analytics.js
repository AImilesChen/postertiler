import { routeSpecs } from './data';
const gaId = import.meta.env.VITE_GA4_ID || '';
const clarityId = import.meta.env.VITE_CLARITY_ID || '';
const ahrefsKey = import.meta.env.VITE_AHREFS_DATA_KEY || '';
const shipsoloDomain = import.meta.env.VITE_SHIPSOLO_DOMAIN || '';
const publicPaths = new Set(routeSpecs.map(route => route.path));
const config = {
  ga4: /^G-[A-Z0-9]+$/.test(gaId),
  clarity: /^[a-z0-9]{6,20}$/.test(clarityId),
  ahrefs: /^[a-zA-Z0-9_-]{10,80}$/.test(ahrefsKey),
  shipsolo: shipsoloDomain === 'postertiler.com',
};
export const ANALYTICS_ENABLED = Object.values(config).some(Boolean);
export const canShowAnalyticsChoice = () => typeof location !== 'undefined' && productionPage();
// Previous GA4-only acceptance does not opt someone into the added providers.
export const CONSENT_KEY = 'postertiler-analytics-consent-v2';
const DURATION = 180 * 24 * 60 * 60 * 1000;
const scripts = new Map(), ahrefsQueue = [];
let allowed = false, initialized = false;
const events = new Set(['page_view', 'poster_start', 'settings_complete', 'pdf_ready', 'pdf_failed', 'pdf_canceled', 'calibration_ready', 'assembly_ready']);
const productionPage = () => location.hostname === 'postertiler.com' && publicPaths.has(location.pathname);
const pageUrl = () => `https://postertiler.com${location.pathname}`;
function referrerOrigin() {
  try { return document.referrer ? new URL(document.referrer).origin : ''; } catch { return ''; }
}
// These tags inspect their own URL/referrer. Do not expose parameterized,
// unknown or account addresses to them. GA4 below uses explicit safe fields.
function safeAutomaticContext() {
  // This public landing page also hosts private uploads and task history.
  // Keep its consented GA4 pageview; do not load DOM/session-recording tags.
  if (['/tools/ai-image-upscaler','/tools/ai-image-generator','/tools/ai-image-editor'].includes(location.pathname)) return false;
  if (location.search || location.hash) return false;
  try {
    if (!document.referrer) return true;
    const ref = new URL(document.referrer);
    return !ref.search && !ref.hash && !ref.username && !ref.password &&
      (ref.origin === 'https://postertiler.com' ? publicPaths.has(ref.pathname) : ref.pathname === '/');
  } catch { return false; }
}
export function readConsent() {
  try {
    const record = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    return record && record.expires > Date.now() && ['accepted', 'rejected'].includes(record.choice) ? record.choice : null;
  } catch { return null; }
}
function clearCookies() {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0].trim();
    if (!/^(_ga(?:_|$)|_clck$|_clsk$)/.test(name)) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    const pieces = location.hostname.split('.');
    for (let i = 0; i < pieces.length - 1; i++) document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${pieces.slice(i).join('.')}; SameSite=Lax`;
  }
}
function addScript(name, src, attributes = {}, onload) {
  if (scripts.has(name)) return;
  const node = document.createElement('script'); node.id = `postertiler-${name}`; node.async = true; node.src = src;
  node.referrerPolicy = 'origin';
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (onload) node.onload = () => { if (allowed && productionPage()) onload(); };
  scripts.set(name, node); document.head.append(node);
}
function safeProperties(parameters) {
  const safe = {};
  if (['A4', 'A3', 'US Letter'].includes(parameters.paper)) safe.paper = parameters.paper;
  if (['image_poster', 'image_pdf', 'pdf_poster', 'life_size', 'halftone'].includes(parameters.tool)) safe.tool = parameters.tool;
  if (Number.isInteger(parameters.sheet_count) && parameters.sheet_count >= 1 && parameters.sheet_count <= 100) safe.sheet_count = parameters.sheet_count;
  return safe;
}
export function applyConsent(choice, persist = true) {
  const previouslyAllowed = allowed;
  if (persist) try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, expires: Date.now() + DURATION })); } catch { /* Tools work without storage. */ }
  allowed = choice === 'accepted' && ANALYTICS_ENABLED && productionPage();
  if (config.ga4) window[`ga-disable-${gaId}`] = !allowed;
  if (!allowed) {
    if (previouslyAllowed) window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    for (const script of scripts.values()) script.remove(); scripts.clear(); ahrefsQueue.length = 0;
    window.dataLayer = []; window.gtag = undefined; window.clarity = undefined; window.plausible = undefined; window.AhrefsAnalytics = undefined;
    clearCookies();
    // Executed third-party listeners cannot be unloaded by deleting a tag.
    // Persist refusal first, then reload to stop all four providers.
    if (previouslyAllowed) location.reload();
    return;
  }
  if (scripts.size) return;
  if (config.ga4) {
    window.dataLayer = [];
    window.gtag = function () { if (allowed) window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    window.gtag('js', new Date());
    window.gtag('config', gaId, { send_page_view: false, page_location: pageUrl(), page_referrer: referrerOrigin(),
      allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 15552000 });
    addScript('ga4', `https://www.googletagmanager.com/gtag/js?id=${gaId}`);
  }
  if (safeAutomaticContext()) {
    if (config.clarity) {
      window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
      window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
      addScript('clarity', `https://www.clarity.ms/tag/${clarityId}`);
    }
    if (config.ahrefs) addScript('ahrefs', 'https://analytics.ahrefs.com/analytics.js', {
      'data-key': ahrefsKey, 'data-page-location': pageUrl(), 'data-no-pageview-auto': '',
    }, () => {
      for (const [name, props] of ahrefsQueue.splice(0)) window.AhrefsAnalytics?.sendEvent(name, { props });
    });
    if (config.shipsolo) {
      window.plausible = function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
      // The supplied host also serves this verified manual-pageview variant.
      addScript('shipsolo', 'https://plausible.shipsolo.io/js/script.manual.js', { 'data-domain': shipsoloDomain });
    }
  }
  trackEvent('page_view');
}
export function trackEvent(name, parameters = {}) {
  if (!allowed || !productionPage() || !events.has(name)) return;
  const properties = safeProperties(parameters);
  if (config.ga4) window.gtag?.('event', name, { page_location: pageUrl(), page_referrer: referrerOrigin(), ...properties });
  if (!safeAutomaticContext()) return;
  if (scripts.has('ahrefs')) {
    const event = name === 'page_view' ? 'pageview' : name;
    if (window.AhrefsAnalytics) window.AhrefsAnalytics.sendEvent(event, { props: properties });
    else if (ahrefsQueue.length < 50) ahrefsQueue.push([event, properties]);
  }
  if (scripts.has('shipsolo')) window.plausible?.(name === 'page_view' ? 'pageview' : name, { u: pageUrl(), props: properties });
  if (scripts.has('clarity') && name !== 'page_view') window.clarity?.('event', name);
}
export function initializeAnalytics() {
  if (initialized) return;
  initialized = true; applyConsent(readConsent(), false);
  window.addEventListener('storage', event => { if (event.key === CONSENT_KEY) applyConsent(readConsent(), false); });
}
