import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBlogArticle } from '../scripts/lib/blog-engine-v4.mjs';
import { routeGradedPublishing } from '../scripts/lib/graded-publishing-router.mjs';

test('blog engine v4 creates a long local blog article from clean evidence', () => {
  const item = {
    id: 'china-power-test',
    title: 'China data centers tap spot power trading',
    source: 'Bloomberg Technology',
    sourceUrl: 'https://example.com/china-power',
    publishedAt: new Date().toISOString(),
    articleText: `${'China data centers, spot power trading, grid exposure, electricity procurement, and operating cost are cleanly described. '.repeat(25)}Final sentence complete.`,
    summary: 'China data centers are using spot power trading to manage electricity cost and grid exposure.',
    infrastructure_relevance_score: 0.78,
  };
  const result = generateBlogArticle(item, { route: routeGradedPublishing(item) });
  assert.equal(result.ok, true);
  assert.equal(result.article.articlePagePublished, true);
  assert.equal(result.article.public_generation_version, 'blog_engine_v4');
  assert.ok(result.article.expertLensFull.finalArticleBody.length >= 2200);
  assert.ok(result.article.public_presentation.view_detail.startsWith('/news/'));
});
