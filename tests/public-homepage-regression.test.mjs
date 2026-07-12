import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const RETIRED_PUBLIC_COPY = [
  'Infrastructure command center',
  'public operating board',
  'Pipeline sources',
  'Signal Board',
  'Source Signal',
  'deskwork',
  'qualifying signal',
  'cycle status',
  'generation version',
];

test('homepage source does not render operational dashboard sections', () => {
  const source = fs.readFileSync('src/pages/index.astro', 'utf8');
  assert.equal(/EditorialCycleStatus|ActiveWatchlist|FeaturedCycleAnalysis|RecentAnalysisArchive/.test(source), false);
  assert.equal(/Signals being monitored|Published deskwork|Cycle status|Latest qualifying signal|Latest published analysis|Today's Constraint|Live Signals|Adjacent Watchlist|Search live and archived coverage/.test(source), false);
  const hits = RETIRED_PUBLIC_COPY.filter((phrase) => new RegExp(phrase, 'i').test(source));
  assert.deepEqual(hits, [], `homepage source must not expose retired public copy: ${hits.join(', ')}`);
});

test('homepage source uses publication vocabulary for reader-facing actions', () => {
  const source = fs.readFileSync('src/pages/index.astro', 'utf8');
  const required = [
    'Latest intelligence',
    'Current edition',
    'Explore the archive',
    'Browse all coverage',
    'Source-linked analysis',
    'Search all public coverage',
  ];
  const missing = required.filter((phrase) => !new RegExp(phrase, 'i').test(source));
  assert.deepEqual(missing, [], `homepage source is missing publication vocabulary: ${missing.join(', ')}`);
});
