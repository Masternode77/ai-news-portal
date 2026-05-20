import test from 'node:test';
import assert from 'node:assert/strict';
import { auditBlogSurfaceV4 } from '../scripts/audit-blog-surface-v4.mjs';
import { generateBlogArticle } from '../scripts/lib/blog-engine-v4.mjs';
import { routeGradedPublishing } from '../scripts/lib/graded-publishing-router.mjs';

test('blog surface audit helper accepts 20 varied local blog fixtures', async () => {
  const latest = [];
  for (let index = 0; index < 20; index += 1) {
    const item = {
      id: `fixture-${index}`,
      title: `Data center power capacity fixture ${index}`,
      source: index % 2 ? 'Utility Dive' : 'Data Center Dynamics',
      publishedAt: new Date(Date.now() - index * 1000).toISOString(),
      articleText: `${'Clean data center power capacity evidence for grid, facility, storage, platform, and procurement planning. '.repeat(25)}Final sentence complete.`,
      summary: 'Data center power capacity and grid planning are central to this item.',
      infrastructure_relevance_score: 0.82,
    };
    const generated = generateBlogArticle(item, { route: routeGradedPublishing(item), recent: latest, index });
    latest.push(generated.article);
  }
  const result = await auditBlogSurfaceV4({ latest, archived: [] });
  assert.equal(result.ok, true);
});
