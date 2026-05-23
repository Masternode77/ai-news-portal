import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillHomepageBlogs } from '../scripts/lib/homepage-backfill.mjs';

test('homepage backfill refuses to manufacture 20 duplicated local blogs', () => {
  const items = Array.from({ length: 22 }, (_, index) => ({
    id: `item-${index}`,
    title: `Data center power capacity item ${index}`,
    source: 'Data Center Dynamics',
    publishedAt: new Date().toISOString(),
    articleText: `${'Clean data center power capacity evidence for grid, facility, and procurement planning. '.repeat(25)}Final sentence complete.`,
    summary: 'Data center power capacity and grid planning are central to this item.',
    infrastructure_relevance_score: 0.8,
  }));
  const result = backfillHomepageBlogs(items, { min: 20 });
  assert.equal(result.ok, false);
  assert.ok(result.blogs.length < 20);
  assert.ok(result.reasons.some((reason) => reason.includes('eligible_local_blogs')));
});
