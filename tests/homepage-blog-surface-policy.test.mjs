import test from 'node:test';
import assert from 'node:assert/strict';
import { homepageBlogSurfaceResult } from '../scripts/lib/homepage-blog-surface-policy.mjs';

test('homepage blog surface policy counts only local blog posts', () => {
  const blogs = Array.from({ length: 20 }, (_, index) => ({
    id: `b${index}`,
    blog_route: 'standard_blog',
    homepagePublished: true,
    articlePagePublished: true,
    archiveOnly: false,
    noindex: false,
  }));
  const result = homepageBlogSurfaceResult([...blogs, { id: 'source', articlePagePublished: false }]);
  assert.equal(result.ok, true);
  assert.equal(result.localBlogCount, 20);
});
