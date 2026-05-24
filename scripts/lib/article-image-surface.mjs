import fs from 'node:fs';
import path from 'node:path';

export const ARTICLE_IMAGE_FIELDS = [
  'generatedImage',
  'sourceImage',
  'image',
  'imageUrl',
  'image_url',
  'thumbnail',
];

const IMAGE_METADATA_FIELDS = [
  'generatedImageProvider',
  'generatedImageModel',
  'imageProvider',
  'image_source_provider',
  'imagePrompt',
];

function clean(value = '') {
  return String(value || '').trim();
}

function firstExistingImage(article = {}) {
  for (const field of ARTICLE_IMAGE_FIELDS) {
    const value = clean(article[field]);
    if (value) return value;
  }
  return '';
}

export function fallbackGeneratedImagePath(article = {}) {
  const id = clean(article.id).replace(/[^a-zA-Z0-9_-]/g, '');
  return id ? `/generated/${id}.svg` : '';
}

export function articleDisplayImage(article = {}) {
  return firstExistingImage(article) || fallbackGeneratedImagePath(article);
}

export function articleImageAlt(article = {}) {
  const title = clean(article.expertLensFull?.finalHeadline || article.title);
  return title ? `${title} editorial visual` : 'Compute Current editorial visual';
}

export function isRemoteImage(image = '') {
  return /^https?:\/\//i.test(clean(image));
}

export function localArticleImagePath(image = '') {
  const value = clean(image);
  if (!value || isRemoteImage(value)) return '';
  return path.join(process.cwd(), 'public', value.replace(/^\//, ''));
}

export function localArticleImageExists(image = '') {
  const localPath = localArticleImagePath(image);
  return !localPath || fs.existsSync(localPath);
}

function imagePatchFrom(article = {}) {
  const patch = {};
  for (const field of [...ARTICLE_IMAGE_FIELDS, ...IMAGE_METADATA_FIELDS]) {
    const value = article[field];
    if (value !== undefined && value !== null && clean(value)) {
      patch[field] = value;
    }
  }

  const displayImage = articleDisplayImage(article);
  if (displayImage && !patch.generatedImage && /^\/generated\//i.test(displayImage)) {
    patch.generatedImage = displayImage;
  }

  return patch;
}

function withPresentationImage(article = {}) {
  const image = articleDisplayImage(article);
  if (!image) return article;
  const next = { ...article };
  if (next.public_presentation && typeof next.public_presentation === 'object') {
    next.public_presentation = {
      ...next.public_presentation,
      id: next.id || next.public_presentation.id,
      image,
      image_alt: next.public_presentation.image_alt || articleImageAlt(next),
    };
  }
  if (next.publicSignal && typeof next.publicSignal === 'object') {
    next.publicSignal = {
      ...next.publicSignal,
      id: next.id || next.publicSignal.id,
      image,
      image_alt: next.publicSignal.image_alt || articleImageAlt(next),
    };
  }
  return next;
}

export function withGeneratedArticleImage(article = {}, generatedImage = '', metadata = {}) {
  const image = clean(generatedImage);
  if (!image) return article;
  return withPresentationImage({
    ...article,
    generatedImage: image,
    ...metadata,
  });
}

export function mergeArticleImageFields(article = {}, canonical = {}) {
  const patch = imagePatchFrom(canonical);
  if (!Object.keys(patch).length) return withPresentationImage(article);
  return withPresentationImage({
    ...article,
    ...patch,
  });
}

function canonicalById(canonicalItems = []) {
  const map = new Map();
  for (const item of canonicalItems) {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return map;
}

export function syncArticleImagesById(items = [], canonicalItems = []) {
  const byId = canonicalById(canonicalItems);
  let changed = 0;
  const updated = items.map((item) => {
    const canonical = byId.get(item?.id);
    if (!canonical) return withPresentationImage(item);
    const next = mergeArticleImageFields(item, canonical);
    if (JSON.stringify(next) !== JSON.stringify(item)) changed += 1;
    return next;
  });
  return { updated, changed };
}

export function syncTaxonomyArticleImagesById(taxonomy = {}, canonicalItems = []) {
  const byId = canonicalById(canonicalItems);
  let changed = 0;
  const syncItems = (items = []) => items.map((item) => {
    const canonical = byId.get(item?.id);
    if (!canonical) return withPresentationImage(item);
    const next = mergeArticleImageFields(item, canonical);
    if (JSON.stringify(next) !== JSON.stringify(item)) changed += 1;
    return next;
  });
  const syncPages = (pages = []) => pages.map((page) => ({
    ...page,
    items: syncItems(page.items || []),
  }));

  return {
    updated: {
      ...taxonomy,
      categories: syncPages(taxonomy.categories || []),
      companies: syncPages(taxonomy.companies || []),
      regions: syncPages(taxonomy.regions || []),
      archive: syncPages(taxonomy.archive || []),
    },
    changed,
  };
}
