import { routeSpecs } from './data';
const configId = import.meta.env.VITE_GA4_ID || '';
const publicPaths = new Set(routeSpecs.map(route => route.path));
export const ANALYTICS_ENABLED = /^G-[A-Z0-9]+$/.test(configId);
export const CONSENT_KEY = 'postertiler-analytics-consent-v1';
const DURATION = 180 * 24 * 60 * 60 * 1000;
let allowed = false, script = null;
export function readConsent() {
  try {
    const record = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    return record && record.expires > Date.now() && ['accepted', 'rejected'].includes(record.choice) ? record.choice : null;
  } catch { return null; }
}
function clearCookies() {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0].trim();
    if (!/^_ga(?:_|$)/.test(name)) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    const pieces = location.hostname.split('.');
    for (let i = 0; i < pieces.length - 1; i++) document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${pieces.slice(i).join('.')}; SameSite=Lax`;
  }
}
export function applyConsent(choice, persist = true) {
  const previouslyAllowed = allowed;
  allowed = choice === 'accepted' && ANALYTICS_ENABLED;
  if (persist) try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, expires: Date.now() + DURATION })); } catch { /* Tool works without storage. */ }
  if (!ANALYTICS_ENABLED) return;
  window[`ga-disable-${configId}`] = !allowed;
  if (!allowed) {
    script?.remove(); script = null;
    window.dataLayer = []; window.gtag = undefined; clearCookies();
    // Reload unloads already-executed Google code and preserves the rejection.
    if (previouslyAllowed) location.reload();
    return;
  }
  if (script) return;
  window.dataLayer = [];
  window.gtag = function () { if (allowed) window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('js', new Date());
  window.gtag('config', configId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 15552000 });
  script = document.createElement('script'); script.id = 'postertiler-ga4'; script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${configId}`;
  document.head.append(script);
  trackEvent('page_view');
}
const events = new Set(['page_view', 'poster_start', 'settings_complete', 'pdf_ready', 'pdf_failed', 'pdf_canceled', 'calibration_ready', 'assembly_ready']);
export function trackEvent(name, parameters = {}) {
  if (!allowed || !ANALYTICS_ENABLED || !events.has(name)) return;
  const safe = { page_location: `https://postertiler.com${publicPaths.has(location.pathname) ? location.pathname : '/404'}`, page_referrer: '' };
  try { safe.page_referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* no referrer */ }
  if (['A4', 'A3', 'US Letter'].includes(parameters.paper)) safe.paper = parameters.paper;
  if (['image_poster', 'image_pdf', 'pdf_poster'].includes(parameters.tool)) safe.tool = parameters.tool;
  if (Number.isInteger(parameters.sheet_count) && parameters.sheet_count >= 1 && parameters.sheet_count <= 100) safe.sheet_count = parameters.sheet_count;
  window.gtag?.('event', name, safe);
}
export function initializeAnalytics() { applyConsent(readConsent(), false); }
