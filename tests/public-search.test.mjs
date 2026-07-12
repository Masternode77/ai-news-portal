import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildPublicSearchRecord,
  matchesPublicSearchRecord,
  normalizeSearchText,
  publicSearchFilterOptions,
  searchTokens,
} from '../src/lib/public-search.js';

test('public search normalizes punctuation, accents, and spacing', () => {
  assert.equal(normalizeSearchText('  GPU-ready São Paulo capacity!!!  '), 'gpu ready sao paulo capacity');
  assert.deepEqual(searchTokens(' Grid   interconnect + cooling '), ['grid', 'interconnect', 'cooling']);
});

test('public search matching checks query tokens, category, and source', () => {
  const record = buildPublicSearchRecord({
    id: 'grid-capacity',
    publicSignal: {
      title: 'Grid queue changes data center timing',
      deck: 'New power rules affect AI infrastructure capacity planning.',
      why_it_matters: 'Utilities and developers need better interconnection timing.',
      category: 'Power & Grid',
      source: 'Utility Dive',
      signal_label: 'Brief',
    },
  });

  assert.equal(matchesPublicSearchRecord(record, { q: 'grid timing' }), true);
  assert.equal(matchesPublicSearchRecord(record, { q: 'cooling timing' }), false);
  assert.equal(matchesPublicSearchRecord(record, { category: 'Power & Grid', source: 'Utility Dive' }), true);
  assert.equal(matchesPublicSearchRecord(record, { category: 'Cloud Capacity' }), false);
  assert.deepEqual(publicSearchFilterOptions([record]), {
    categories: [{ value: 'power grid', label: 'Power & Grid' }],
    sources: [{ value: 'utility dive', label: 'Utility Dive' }],
  });
});

test('search route uses the public archive feed as its searchable source', () => {
  const route = fs.readFileSync('src/pages/search.astro', 'utf8');

  assert.match(route, /import \{ publicContentInventory \} from '\.\.\/lib\/public-content-inventory\.js'/);
  assert.match(route, /import \{ buildArchiveFeed \} from '\.\.\/\.\.\/scripts\/lib\/archive-feed-builder\.mjs'/);
  assert.match(route, /buildArchiveFeed\(publicContentInventory,\s*\{/);
  assert.match(route, /pageSize:\s*SEARCH_PAGE_SIZE/);
  assert.match(route, /const SEARCH_PAGE_SIZE = 10000/);
  assert.doesNotMatch(route, /search-index\.json/);
});
