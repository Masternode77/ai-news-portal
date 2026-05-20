import { isLocalHomepageBlog, homepageLocalBlogCount } from './homepage-visible-count.mjs';

export const HOMEPAGE_MIN_LOCAL_BLOGS = 20;

export function homepageBlogSurfaceResult(items = [], options = {}) {
  const min = options.min || HOMEPAGE_MIN_LOCAL_BLOGS;
  const localBlogs = items.filter(isLocalHomepageBlog);
  const sourceCards = items.filter((item) => item.homepagePublished !== false && !isLocalHomepageBlog(item));
  const reasons = [];
  if (localBlogs.length < min) reasons.push(`homepage_local_blog_count_below_${min}`);
  return {
    ok: reasons.length === 0,
    min,
    localBlogCount: localBlogs.length,
    sourceCardCount: sourceCards.length,
    localBlogs,
    sourceCards,
    reasons,
  };
}

export { isLocalHomepageBlog, homepageLocalBlogCount };
