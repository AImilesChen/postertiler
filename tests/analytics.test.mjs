import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/analytics.js', import.meta.url), 'utf8');
const all = { VITE_GA4_ID: 'G-TEST123', VITE_CLARITY_ID: 'fixture1234', VITE_AHREFS_DATA_KEY: 'public-fixture-key', VITE_SHIPSOLO_DOMAIN: 'postertiler.com' };
function harness(env = all, address = {}) {
  const values = new Map(), loaded = [], sent = [], listeners = {}, removed = [];
  const document = { cookie: '', referrer: '', createElement: () => ({ attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, remove() { removed.push(this.id); } }), head: { append: script => loaded.push(script) } };
  const location = { pathname: '/', hostname: 'postertiler.com', search: '', hash: '', reload: () => sent.push('reload'), ...address };
  const window = { addEventListener: (name, fn) => { listeners[name] = fn; } };
  const context = vm.createContext({ document, location, window, routeSpecs: [{ path: '/' }, { path: '/gallery' }, {path:'/tools/ai-image-upscaler'},{path:'/tools/ai-image-generator'},{path:'/tools/ai-image-editor'},{path:'/tools/dithering-tool'}], URL, Date, Set, Map, localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) } });
  const transformed = source.replace("import { routeSpecs } from './data';", '').replace(/import\.meta\.env\.([A-Z0-9_]+)/g, (_, key) => JSON.stringify(env[key] || '')).replaceAll('export ', '');
  vm.runInContext(transformed + '\nglobalThis.api={applyConsent,initializeAnalytics,trackEvent,readConsent,CONSENT_KEY};', context);
  return { api: context.api, window, document, location, loaded, sent, values, listeners, removed };
}
test('unconfigured analytics never loads or sends, even after acceptance', () => {
  const h = harness({}); h.api.initializeAnalytics(); h.api.applyConsent('accepted'); h.api.trackEvent('pdf_ready'); assert.deepEqual(h.loaded, []);
});
test('all four providers remain blocked before a choice and after rejection', () => {
  const h = harness(); h.api.initializeAnalytics(); h.api.trackEvent('pdf_ready'); h.api.applyConsent('rejected'); assert.deepEqual(h.loaded, []);
});
test('acceptance loads each provider once, grants only analytics storage and queues a single pageview', () => {
  const h = harness(); h.api.applyConsent('accepted'); h.api.applyConsent('accepted');
  assert.equal(h.loaded.length, 4);
  assert.equal(h.window.dataLayer.filter(args => args[0] === 'event' && args[1] === 'page_view').length, 1);
  const gaConfig = h.window.dataLayer.find(args => args[0] === 'config')[2]; assert.equal(gaConfig.send_page_view, false); assert.equal(gaConfig.page_location, 'https://postertiler.com/');
  const clarity = h.window.clarity.q[0]; assert.equal(clarity[0], 'consentv2'); assert.equal(clarity[1].ad_Storage, 'denied'); assert.equal(clarity[1].analytics_Storage, 'granted');
  assert.equal(h.loaded.find(tag => tag.id === 'postertiler-ahrefs').attributes['data-no-pageview-auto'], '');
  assert.equal(h.window.plausible.q.length, 1); assert.equal(h.window.plausible.q[0][0], 'pageview');
});
test('only permitted events and properties reach provider APIs; file/identity data is discarded', () => {
  const h = harness(); h.api.applyConsent('accepted');
  h.api.trackEvent('pdf_ready', { filename: 'PRIVATE_FILE.jpg', image: 'base64-secret', email: 'private@example.org', paper: 'A4', sheet_count: 4, tool: 'pdf_poster' });
  h.api.trackEvent('private_arbitrary_event');
  const ahrefs = []; h.window.AhrefsAnalytics = { sendEvent: (...args) => ahrefs.push(args) }; h.loaded.find(tag => tag.id === 'postertiler-ahrefs').onload();
  assert.equal(ahrefs.length, 2); assert.equal(ahrefs[1][0], 'pdf_ready');
  const events = h.window.dataLayer.filter(args => args[0] === 'event'); assert.equal(events.length, 2);
  const payload = JSON.stringify({ ga: events, ahrefs, plausible: h.window.plausible.q, clarity: h.window.clarity.q });
  for (const secret of ['PRIVATE_FILE', 'base64-secret', 'private@example.org', 'private_arbitrary']) assert.ok(!payload.includes(secret));
  assert.equal(events[1][2].sheet_count, 4); assert.equal(events[1][2].tool, 'pdf_poster');
});
test('withdrawal saves rejection, denies Clarity storage, unloads tags and blocks future events', () => {
  const h = harness(); h.api.applyConsent('accepted'); const clarity = h.window.clarity; h.api.applyConsent('rejected'); h.api.trackEvent('pdf_ready');
  assert.equal(h.window['ga-disable-G-TEST123'], true); assert.equal(h.window.dataLayer.length, 0);
  assert.equal(clarity.q.at(-1)[1].analytics_Storage, 'denied'); assert.equal(h.removed.length, 4);
  assert.equal(h.api.readConsent(), 'rejected'); assert.deepEqual(h.sent, ['reload']);
});
test('account, API, unknown routes and nonproduction hosts never load visitor tags', () => {
  for (const address of [{ pathname: '/account' }, { pathname: '/cloud' }, { pathname: '/account/tasks' }, { pathname: '/account/billing' }, { pathname: '/account/settings' }, { pathname: '/api/auth/callback/google' }, { pathname: '/private/user@example.org' }, { hostname: 'localhost' }, { hostname: 'preview.example.org' }]) {
    const h = harness(all, address); h.api.applyConsent('accepted'); h.api.trackEvent('pdf_ready'); assert.deepEqual(h.loaded, []);
  }
});
test('private URL parameters or referrers are excluded from tags that independently inspect addresses', () => {
  for (const kind of ['query', 'hash', 'referrer']) {
    const h = harness();
    if (kind === 'query') h.location.search = '?email=private@example.org';
    if (kind === 'hash') h.location.hash = '#private';
    if (kind === 'referrer') h.document.referrer = 'https://example.org/private?email=private@example.org';
    h.api.applyConsent('accepted'); assert.equal(h.loaded.length, 1); assert.equal(h.loaded[0].id, 'postertiler-ga4');
    const serialized = JSON.stringify(h.window.dataLayer); assert.ok(!serialized.includes('private')); assert.ok(!serialized.includes('email='));
  }
});
test('an older GA4-only choice or expired expanded choice cannot opt users in', () => {
  const h = harness(); h.values.set('postertiler-analytics-consent-v1', JSON.stringify({ choice: 'accepted', expires: Date.now() + 10000 }));
  h.api.initializeAnalytics(); assert.deepEqual(h.loaded, []);
  h.values.set(h.api.CONSENT_KEY, JSON.stringify({ choice: 'accepted', expires: Date.now() - 1 })); assert.equal(h.api.readConsent(), null);
});
test('a refusal in another tab stops collection in the current tab', () => {
  const h = harness(); h.api.initializeAnalytics(); h.api.applyConsent('accepted');
  h.values.set(h.api.CONSENT_KEY, JSON.stringify({ choice: 'rejected', expires: Date.now() + 10000 }));
  h.listeners.storage({ key: h.api.CONSENT_KEY }); assert.deepEqual(h.sent, ['reload']);
});

test('public AI uploads load only explicit GA4 pageviews and never DOM recording providers',()=>{
 for(const pathname of ['/tools/ai-image-upscaler','/tools/ai-image-generator','/tools/ai-image-editor']){
 const h=harness(all,{pathname});h.api.applyConsent('accepted');
 assert.deepEqual(h.loaded.map(tag=>tag.id),['postertiler-ga4']);
 const events=h.window.dataLayer.filter(args=>args[0]==='event');assert.equal(events.length,1);assert.equal(events[0][1],'page_view');
 assert.equal(events[0][2].page_location,'https://postertiler.com'+pathname);
 assert.equal(h.window.clarity,undefined);assert.equal(h.window.AhrefsAnalytics,undefined);
 }
});


test('local dithering records consented safe actions without exposing images or recording DOM',()=>{
 const h=harness(all,{pathname:'/tools/dithering-tool'});
 h.api.trackEvent('tool_start',{tool:'dither'});assert.equal(h.loaded.length,0);
 h.api.applyConsent('accepted');assert.deepEqual(h.loaded.map(tag=>tag.id),['postertiler-ga4']);
 for(const name of ['tool_start','image_download','tool_to_poster'])h.api.trackEvent(name,{tool:'dither',filename:'private-photo.png',image:'private-pixels'});
 const events=h.window.dataLayer.filter(args=>args[0]==='event');assert.equal(events.length,4);
 assert.equal(events[1][2].tool,'dither');assert.ok(!JSON.stringify(events).includes('private-'));
 h.api.applyConsent('rejected');const before=h.window.dataLayer.filter(args=>args[0]==='event').length;h.api.trackEvent('image_download',{tool:'dither'});assert.equal(h.window.dataLayer.filter(args=>args[0]==='event').length,before);
});
