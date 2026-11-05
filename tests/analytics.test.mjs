import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/analytics.js', import.meta.url), 'utf8');
function harness(id) {
  const values = new Map(), loaded = [], sent = [];
  const document = { cookie: '', referrer: 'https://example.org/private?email=user@example.org', createElement: () => ({ remove() {} }), head: { append: script => loaded.push(script.src) } };
  const location = { pathname: '/', hostname: 'postertiler.com', reload: () => sent.push('reload') };
  const context = vm.createContext({ document, location, window: {}, routeSpecs: [{ path: '/' }], URL, Date, Set, localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) } });
  const transformed = source.replace("import { routeSpecs } from './data';", '').replace('import.meta.env.VITE_GA4_ID', JSON.stringify(id)).replaceAll('export ', '');
  vm.runInContext(transformed + '\nglobalThis.api={applyConsent,initializeAnalytics,trackEvent,readConsent};', context);
  return { api: context.api, window: context.window, location, loaded, sent, values };
}
test('unconfigured analytics never loads or sends, even after acceptance', () => {
  const h = harness(''); h.api.initializeAnalytics(); h.api.applyConsent('accepted'); h.api.trackEvent('pdf_ready'); assert.deepEqual(h.loaded, []);
});
test('a configured ID remains blocked until explicit acceptance', () => {
  const h = harness('G-TEST123'); h.api.initializeAnalytics(); h.api.trackEvent('pdf_ready'); h.api.applyConsent('rejected'); assert.deepEqual(h.loaded, []);
});
test('opt-in sends only allowlisted fields and sanitized URLs', () => {
  const h = harness('G-TEST123'); h.api.applyConsent('accepted');
  h.api.trackEvent('pdf_ready', { filename: 'private.jpg', image: 'base64-secret', email: 'test@example.org', paper: 'A4', sheet_count: 4, tool: 'pdf_poster' });
  h.api.trackEvent('private_arbitrary_event'); assert.equal(h.loaded.length, 1);
  const events = h.window.dataLayer.filter(args => args[0] === 'event'); assert.equal(events.length, 2);
  const payload = JSON.stringify(events); assert.ok(!payload.includes('private')); assert.ok(!payload.includes('email')); assert.ok(!payload.includes('base64'));
  assert.equal(events[1][2].page_referrer, 'https://example.org'); assert.equal(events[1][2].sheet_count, 4);
  assert.equal(events[1][2].tool, 'pdf_poster');
});
test('withdrawal blocks future events and persists refusal before unloading code', () => {
  const h = harness('G-TEST123'); h.api.applyConsent('accepted'); h.api.applyConsent('rejected'); h.api.trackEvent('pdf_ready');
  assert.equal(h.window['ga-disable-G-TEST123'], true); assert.equal(h.window.dataLayer.length, 0); assert.equal(h.api.readConsent(), 'rejected'); assert.deepEqual(h.sent, ['reload']);
});
test('unrecognized paths cannot leak arbitrary URL content into analytics', () => {
  const h = harness('G-TEST123'); h.location.pathname = '/private/user@example.org'; h.api.applyConsent('accepted');
  const event = h.window.dataLayer.find(args => args[0] === 'event');
  assert.equal(event[2].page_location, 'https://postertiler.com/404');
});
