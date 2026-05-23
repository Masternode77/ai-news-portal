import { selectBlogArchetype } from './blog-archetype-selector.mjs';

export function routeBlogOutline(article = {}, options = {}) {
  const archetype = options.archetype || selectBlogArchetype(article, options);
  return {
    archetype,
    headings: archetype.headings,
  };
}
