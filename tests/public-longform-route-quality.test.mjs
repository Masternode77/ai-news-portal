import test from 'node:test';
import assert from 'node:assert/strict';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { longformQualityResult } from '../scripts/lib/longform-engine.mjs';
import { isPublicLongformArticle } from '../scripts/lib/public-surface-eligibility.mjs';

test('public longform routes meet the longform quality policy', () => {
  const failures = [...latestNews, ...archivedNews]
    .filter(isPublicLongformArticle)
    .map((article) => {
      const quality = longformQualityResult(article);
      return quality.ok ? null : `${article.id}: ${quality.reasons.join(',')}`;
    })
    .filter(Boolean);

  assert.deepEqual(failures, []);
});
