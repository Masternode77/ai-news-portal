import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractReaderVisibleText,
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
  assert.ok(phrases.includes('blueprint'));
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

test('public copy sanitizer does not rewrite source-specific blueprint wording', () => {
  assert.equal(
    sanitizePublicCopy('Architecting the blueprint for mission impact across the public sector'),
    'Architecting the blueprint for mission impact across the public sector'
  );
  assert.equal(
    sanitizePublicCopy('article blueprint'),
    'No new stories yet.'
  );
});

test('reader-visible extraction ignores URL-only internal words but keeps visible banned copy', () => {
  const urlOnly = extractReaderVisibleText(`
    <a href="https://cloud.google.com/blog/topics/threat-intelligence/blueprint-security">
      <img src="/generated/articles/google-blueprint/thumbnail.webp" alt="Google Cloud source image">
      Source
    </a>
  `);
  const visible = extractReaderVisibleText('<main><p>Signal Board blueprint</p><span');

  assert.equal(/blueprint/i.test(urlOnly), false);
  assert.deepEqual(findInternalLanguageHits([{ path: '/', text: urlOnly }]), []);
  assert.ok(findInternalLanguageHits([{ path: '/', text: visible }]).some((hit) => hit.phrase === 'Signal Board'));
  assert.ok(findInternalLanguageHits([{ path: '/', text: visible }]).some((hit) => hit.phrase === 'blueprint'));
  assert.deepEqual(findInternalLanguageHits([{ path: '/', text: 'blueprints are pluralized source wording' }]), []);
});

test('reader-visible extraction includes accessibility text without scanning href or src URLs', () => {
  const text = extractReaderVisibleText(`
    <a href="https://example.com/source-signal">
      <img src="/generated/articles/signal-board/thumbnail.webp" alt="Signal Board">
      <span aria-label="Source Signal" title="Latest qualifying signal">Source</span>
    </a>
  `);
  const hits = findInternalLanguageHits([{ path: '/', text }]);

  assert.equal(/source-signal|signal-board\/thumbnail/i.test(text), false);
  assert.ok(hits.some((hit) => hit.phrase === 'Signal Board'));
  assert.ok(hits.some((hit) => hit.phrase === 'Source Signal'));
  assert.ok(hits.some((hit) => hit.phrase === 'Latest qualifying signal'));
});

test('reader-visible extraction does not merge separate cards into banned phrases', () => {
  const crossCardText = extractReaderVisibleText(`
    <article><a href="https://example.com/one">Source</a></article>
    <article><span>Signal</span></article>
  `);
  const inlineText = extractReaderVisibleText('<article><span>Source</span><span>Signal</span></article>');

  assert.doesNotMatch(crossCardText, /Source\s+Signal/);
  assert.deepEqual(findInternalLanguageHits([{ path: '/', text: crossCardText }]), []);
  assert.match(inlineText, /Source\s+Signal/);
  assert.ok(findInternalLanguageHits([{ path: '/', text: inlineText }]).some((hit) => hit.phrase === 'Source Signal'));
});

test('reader-visible extraction ignores data attributes that mirror accessibility names', () => {
  const text = extractReaderVisibleText(`
    <img
      data-alt="Signal Board"
      data-title="Latest qualifying signal"
      data-aria-label="Source Signal"
      alt="Public infrastructure visual"
    >
  `);
  const hits = findInternalLanguageHits([{ path: '/', text }]);

  assert.match(text, /Public infrastructure visual/);
  assert.doesNotMatch(text, /Signal Board|Latest qualifying signal|Source Signal/);
  assert.deepEqual(hits, []);
});

test('reader-visible extraction handles malformed accessibility attributes', () => {
  const text = extractReaderVisibleText('<main><img alt="Signal Board"><span aria-label="Source Signal"');
  const hits = findInternalLanguageHits([{ path: '/', text }]);

  assert.ok(hits.some((hit) => hit.phrase === 'Signal Board'));
  assert.ok(hits.some((hit) => hit.phrase === 'Source Signal'));
});
