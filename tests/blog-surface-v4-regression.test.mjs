import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditBlogSurfaceV4 } from '../scripts/audit-blog-surface-v4.mjs';
import { generateBlogArticle } from '../scripts/lib/blog-engine-v4.mjs';
import { routeGradedPublishing } from '../scripts/lib/graded-publishing-router.mjs';

test('legacy blog surface audit flags repeated fixture openings under autonomous desk policy', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-surface-v4-audit-'));
  const latest = [];
  try {
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
    const result = await auditBlogSurfaceV4({
      latest,
      archived: [],
      reportPath: path.join(directory, 'report.md'),
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes('duplicate_first_10_opening_words'));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
