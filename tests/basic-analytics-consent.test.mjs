import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = fs.readFileSync('src/scripts/basic-analytics-consent.js', 'utf8');
function setup({ saved = null, id = 'G-TEST12345', blocked = false, writeBlocked = false } = {}) {
  const listeners = {};
  const buttons = Object.fromEntries(['accept', 'reject', 'choices'].map(name => [name, { addEventListener: (_, fn) => { listeners[name] = fn; }, focus() {} }]));
  const panel = { hidden: true, dataset: { measurementId: id }, querySelector: selector => selector.includes('status') ? {} : buttons[selector.includes('accept') ? 'accept' : 'reject'] };
  const requests = [], cookies = [], storage = new Map(saved ? [['ccAnalyticsConsentV1', saved]] : []);
  let reloads = 0;
  const document = { getElementById: id => id === 'cc-analytics-consent' ? panel : { focus() {} }, querySelectorAll: () => [buttons.choices], createElement: () => ({}), head: { appendChild: script => requests.push(script.src) } };
  Object.defineProperty(document, 'cookie', { get: () => '_ga=one; _ga_TEST=two; other=three', set: value => cookies.push(value) });
  const window = { addEventListener: (_, fn) => { listeners.storage = fn; } };
  vm.runInNewContext(source, { sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document, window, location: { hostname: 'www.computecurrent.com', reload: () => reloads++ }, localStorage: { getItem: key => { if (blocked) throw Error('blocked'); return storage.get(key); }, setItem: (key, value) => { if (blocked || writeBlocked) throw Error('blocked'); storage.set(key, value); } } });
  return { panel, requests, cookies, storage, listeners, window, reloads: () => reloads };
}
const accepted = JSON.stringify({ choice: 'accepted', expires: Date.now() + 100000 });
test('fresh, rejected, malformed and expired choices send no requests', () => {
  for (const saved of [null, '{', JSON.stringify({ choice: 'rejected', expires: Date.now() + 100000 }), JSON.stringify({ choice: 'accepted', expires: 1 })]) {
    const app = setup({ saved });
    assert.deepEqual(app.requests, []);
    assert.equal(app.window.gtag, undefined);
  }
});
test('accept loads once with analytics-only consent; rejection removes cookies and reloads', () => {
  const app = setup();
  app.listeners.accept(); app.listeners.accept();
  assert.equal(app.requests.length, 1);
  const commands = app.window.dataLayer.map(args => Array.from(args));
  assert.equal(commands[0][2].analytics_storage, 'denied');
  assert.equal(commands[2][2].analytics_storage, 'granted');
  for (const signal of ['ad_storage', 'ad_user_data', 'ad_personalization']) assert.equal(commands[2][2][signal], 'denied');
  assert.equal(commands[4][2].allow_google_signals, false);
  app.listeners.choices(); assert.equal(app.panel.hidden, false);
  app.listeners.reject();
  assert.equal(app.reloads(), 1);
  assert.equal(app.window['ga-disable-G-TEST12345'], true);
  assert.equal(JSON.parse(app.storage.get('ccAnalyticsConsentV1')).choice, 'rejected');
  assert.ok(app.cookies.some(value => value.includes('Domain=www.computecurrent.com')));
  assert.ok(app.cookies.some(value => value.includes('Domain=.computecurrent.com')));
  assert.ok(app.cookies.every(value => !value.startsWith('other=')));
});
test('return visit respects acceptance but excluded routes never load measurement', () => {
  assert.equal(setup({ saved: accepted }).requests.length, 1);
  const policy = setup({ saved: accepted, id: '' });
  policy.listeners.accept(); assert.deepEqual(policy.requests, []);
  policy.listeners.reject(); assert.equal(policy.reloads(), 0);
});
test('blocked storage is initially denied and cross-tab revocation stops active analytics', () => {
  const blocked = setup({ blocked: true });
  assert.deepEqual(blocked.requests, []);
  blocked.listeners.reject(); assert.deepEqual(blocked.requests, []);
  const app = setup({ saved: accepted });
  app.storage.clear(); app.listeners.storage({ key: 'ccAnalyticsConsentV1' });
  assert.equal(app.reloads(), 1);
});

test('failed rejection save never reloads into a stale stored acceptance', () => {
  const app = setup({ saved: accepted, writeBlocked: true });
  app.listeners.reject();
  assert.equal(app.reloads(), 0);
  assert.equal(app.window['ga-disable-G-TEST12345'], true);
  assert.equal(app.window.dataLayer.at(-1)[2].analytics_storage, 'denied');
  assert.equal(app.panel.hidden, false);
});