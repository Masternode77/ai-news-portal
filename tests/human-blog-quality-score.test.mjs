import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBlogArticle } from '../scripts/lib/blog-engine-v4.mjs';
import { routeGradedPublishing } from '../scripts/lib/graded-publishing-router.mjs';
import { humanBlogQualityScore } from '../scripts/lib/human-blog-quality-score.mjs';

test('human blog quality score passes generated blog content', () => {
  const item = {
    id: 'memory-pricing-test',
    title: 'AI memory pricing changes virtualization planning',
    source: 'ServeTheHome',
    articleText: `${'AI memory pricing, HBM, VM density, Proxmox, KVM, Hyper-V, Nutanix, and enterprise procurement are discussed. '.repeat(25)}Final sentence complete.`,
    summary: 'AI memory pricing affects VM density and enterprise platform cost planning.',
    infrastructure_relevance_score: 0.9,
  };
  const generated = generateBlogArticle(item, { route: routeGradedPublishing(item) });
  const score = humanBlogQualityScore(generated.article, generated.evidencePack);
  assert.equal(score.ok, true);
  assert.ok(score.human_blog_quality_score >= 0.82);
});
