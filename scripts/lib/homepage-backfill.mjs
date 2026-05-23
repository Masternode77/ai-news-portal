import { generateBlogArticle } from './blog-engine-v4.mjs';
import { routeGradedPublishing, GRADED_ROUTES } from './graded-publishing-router.mjs';
import { isLocalHomepageBlog } from './homepage-visible-count.mjs';

function publishedTime(article = {}) {
  const ms = new Date(article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function selectHomepageBackfillCandidates(items = [], options = {}) {
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const lookbackDays = options.lookbackDays || 30;
  const cutoff = now - lookbackDays * 24 * 60 * 60 * 1000;
  return items
    .filter((item) => item?.id && publishedTime(item) >= cutoff)
    .map((item) => ({ item, route: routeGradedPublishing(item) }))
    .filter(({ route }) => [GRADED_ROUTES.CORE_LONGFORM_BLOG, GRADED_ROUTES.STANDARD_BLOG].includes(route.route))
    .sort((a, b) => {
      const routeDelta = (a.route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG ? -1 : 0) - (b.route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG ? -1 : 0);
      if (routeDelta) return routeDelta;
      return (b.route.score || 0) - (a.route.score || 0) || publishedTime(b.item) - publishedTime(a.item);
    });
}

export function backfillHomepageBlogs(items = [], options = {}) {
  const min = options.min || 20;
  const existing = items.filter(isLocalHomepageBlog);
  const recent = [...existing];
  const generatedById = new Map(existing.map((item) => [item.id, item]));

  if (existing.length >= min) {
    return { ok: true, blogs: existing.slice(0, min), generated: [], reasons: [] };
  }

  for (const lookbackDays of [7, 14, 30, 45]) {
    for (const { item, route } of selectHomepageBackfillCandidates(items, { ...options, lookbackDays })) {
      if (generatedById.has(item.id)) continue;
      const result = generateBlogArticle(item, {
        route,
        recent,
        index: recent.length,
      });
      if (!result.ok) continue;
      generatedById.set(result.article.id, result.article);
      recent.push(result.article);
      if (recent.length >= min) {
        return {
          ok: true,
          blogs: recent.slice(0, min),
          generated: recent.slice(existing.length),
          reasons: [],
          lookbackDays,
        };
      }
    }
  }

  return {
    ok: false,
    blogs: recent,
    generated: recent.slice(existing.length),
    reasons: [`only_${recent.length}_eligible_local_blogs_after_45_day_backfill`],
    lookbackDays: 45,
  };
}
