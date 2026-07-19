import { imageSlugPart } from './article-image-prompt.mjs';

export const ARTICLE_IMAGE_VARIANTS = {
  hero: { file: 'hero', width: 1536, height: 864, label: '16:9 hero' },
  thumbnail: { file: 'thumbnail', width: 1200, height: 900, label: '4:3 thumbnail' },
  og: { file: 'og', width: 1200, height: 630, label: '1.91:1 OpenGraph' },
};

function cleanId(value = '') {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

export function articleImageSlug(article = {}) {
  const id = cleanId(article.id);
  const title = imageSlugPart(article.expertLensFull?.finalHeadline || article.title || '');
  return [id, title].filter(Boolean).join('-') || 'article-image';
}

export function canonicalArticleImagePaths(article = {}, options = {}) {
  const slug = options.slug || articleImageSlug(article);
  const extension = String(options.extension || 'svg').replace(/^\./, '');
  const base = `/generated/articles/${slug}`;
  const id = cleanId(article.id || slug);
  const legacyExtension = String(options.legacyExtension || extension).replace(/^\./, '');
  return {
    slug,
    heroImage: `${base}/${ARTICLE_IMAGE_VARIANTS.hero.file}.${extension}`,
    thumbnailImage: `${base}/${ARTICLE_IMAGE_VARIANTS.thumbnail.file}.${extension}`,
    ogImage: `${base}/${ARTICLE_IMAGE_VARIANTS.og.file}.${extension}`,
    legacyImage: `/generated/${id}.${legacyExtension}`,
  };
}
