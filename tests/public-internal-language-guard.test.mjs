import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findInternalLanguageHits,
  isAdminPublicPath,
  loadInternalPublicBannedPhrases,
  sanitizePublicCopy,
} from '../scripts/lib/internal-language-guard.mjs';

test('loads the internal public banned phrase inventory', () => {
  const phrases = loadInternalPublicBannedPhrases();
  assert.ok(phrases.includes('Cycle status'));
  assert.ok(phrases.includes('completed_no_qualifying_signals'));
  assert.ok(phrases.includes('Compute Current publishes only the strongest verified clusters from each cycle.'));
  assert.ok(phrases.includes("Editor's Brief"));
  assert.ok(phrases.includes('Adjacent Watchlist'));
  assert.ok(phrases.includes('extraction QA'));
});

test('internal language guard flags public HTML and metadata hits but allows admin paths', () => {
  const hits = findInternalLanguageHits([
    {
      path: '/index.html',
      surface: 'html',
      text: '<h2>Cycle status completed_no_qualifying_signals</h2>',
    },
    {
      path: '/admin/content-quality/index.html',
      surface: 'html',
      text: '<h2>Cycle status completed_no_qualifying_signals</h2>',
    },
    {
      path: '/rss.xml',
      surface: 'rss',
      text: '<description>Latest qualifying signal</description>',
    },
    {
      path: '/news/example/',
      surface: 'html',
      text: "<h2>Editor's Brief</h2><p>Compute Current is keeping the card short because the available source text contains clipped, boilerplate, or incomplete evidence.</p>",
    },
  ]);

  assert.equal(isAdminPublicPath('/admin/content-quality/index.html'), true);
  assert.deepEqual([...new Set(hits.map((hit) => hit.path))], ['/index.html', '/rss.xml', '/news/example/']);
  assert.ok(hits.some((hit) => hit.phrase === 'Cycle status'));
  assert.ok(hits.some((hit) => hit.phrase === 'Latest qualifying signal'));
  assert.ok(hits.some((hit) => hit.phrase === "Editor's Brief"));
  assert.ok(hits.some((hit) => hit.phrase === 'Compute Current is keeping the card short'));
});

test('public copy sanitizer replaces public empty-state internals with editorial copy', () => {
  assert.equal(
    sanitizePublicCopy('Cycle status completed_no_qualifying_signals'),
    'No new stories yet.'
  );
  assert.equal(
    sanitizePublicCopy('Find published anaylsis'),
    'Search the archive'
  );
});
