import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  normalizeExtraPath,
  runProductionSmoke,
} from '../scripts/probe-production-surface.mjs';

const BASE_URL = 'https://example.test';
const pages = new Map([
  ['/', '<a href="/column/">Columns</a>'],
  ['/column/', '<a class="column-list-card" href="/column/core-capacity-test/">Core column</a>'],
  ['/column/core-capacity-test/', '<html><head><link rel="canonical" href="https://example.test/column/core-capacity-test/"></head><body><article><h1>Core capacity test</h1></article></body></html>'],
  ['/author/josh-inn/', '<h1>Josh Jiwoon Inn</h1>'],
  ['/rss.xml', '<?xml version="1.0"?><rss><channel><item><link>https://example.test/column/core-capacity-test/</link></item></channel></rss>'],
  ['/sitemap.xml', '<?xml version="1.0"?><urlset><url><loc>https://example.test/column/core-capacity-test/</loc></url></urlset>'],
]);

function fixtureFetch(overrides = new Map()) {
  return async (input) => {
    const url = new URL(input);
    const fixture = overrides.has(url.pathname) ? overrides.get(url.pathname) : pages.get(url.pathname);
    if (fixture instanceof Response) return fixture;
    if (fixture === undefined) return new Response('missing', { status: 404 });
    return new Response(fixture, { status: 200, headers: { 'content-type': url.pathname.endsWith('.xml') ? 'application/xml' : 'text/html' } });
  };
}

test('production smoke proves required routes, the newest core column, and RSS column inclusion', async () => {
  const result = await runProductionSmoke({ baseUrl: BASE_URL, fetchImpl: fixtureFetch(), extraPath: '/archive/' });

  assert.equal(result.ok, false, 'the explicit extra path is required and must fail when missing');
  assert.ok(result.failures.some((failure) => failure.includes('/archive/')));

  const passing = await runProductionSmoke({ baseUrl: BASE_URL, fetchImpl: fixtureFetch() });
  assert.equal(passing.ok, true);
  assert.equal(passing.coreColumnPath, '/column/core-capacity-test/');
  assert.equal(passing.statuses['/rss.xml'], 200);
});

test('production smoke fails closed on HTTP errors and missing RSS column entries', async () => {
  const serverError = new Map([['/', new Response('unavailable', { status: 500 })]]);
  const failedStatus = await runProductionSmoke({ baseUrl: BASE_URL, fetchImpl: fixtureFetch(serverError) });
  assert.equal(failedStatus.ok, false);
  assert.ok(failedStatus.failures.some((failure) => failure.includes('/ returned HTTP 500')));

  const noColumnRss = new Map([['/rss.xml', new Response('<?xml version="1.0"?><rss><channel></channel></rss>', { status: 200 })]]);
  const failedRss = await runProductionSmoke({ baseUrl: BASE_URL, fetchImpl: fixtureFetch(noColumnRss) });
  assert.equal(failedRss.ok, false);
  assert.ok(failedRss.failures.some((failure) => failure.includes('RSS')));
});

test('extra production probe input remains a same-origin URL path', () => {
  assert.equal(normalizeExtraPath('/column/example/?view=compact'), '/column/example/?view=compact');
  for (const unsafe of ['https://attacker.test/', '//attacker.test/', 'column/example/', '/\\attacker', '/%0aheader']) {
    assert.throws(() => normalizeExtraPath(unsafe));
  }
});

test('manual production workflow runs the asserting verifier with pinned read-only checkout', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/prod-smoke.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node \.\/scripts\/probe-production-surface\.mjs/);
  assert.doesNotMatch(workflow, /\|\| true|continue-on-error/);
  for (const match of workflow.matchAll(/uses:\s*actions\/(?:checkout|setup-node)@([^\s]+)/g)) assert.match(match[1], /^[0-9a-f]{40}$/);
});
