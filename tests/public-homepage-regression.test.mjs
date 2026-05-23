import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('homepage source does not render operational dashboard sections', () => {
  const source = fs.readFileSync('src/pages/index.astro', 'utf8');
  assert.equal(/EditorialCycleStatus|ActiveWatchlist|FeaturedCycleAnalysis|RecentAnalysisArchive/.test(source), false);
  assert.equal(/Signals being monitored|Published deskwork|Cycle status|Latest qualifying signal|Latest published analysis|Today's Constraint|Live Signals|Adjacent Watchlist|Search live and archived coverage/.test(source), false);
});
