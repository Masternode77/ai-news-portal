import { isPublicLongformArticle } from '../../scripts/lib/public-surface-eligibility.mjs';

export function currentPublicDetailInventory(articles = [], options = {}) {
  if (!Array.isArray(articles)) return [];

  const seenArticleIds = new Set();
  try {
    return articles.filter((article) => {
      if (!isPublicLongformArticle(article, options)) return false;

      const articleId = String(article?.id || '');
      if (seenArticleIds.has(articleId)) return false;
      seenArticleIds.add(articleId);
      return true;
    });
  } catch {
    return [];
  }
}
