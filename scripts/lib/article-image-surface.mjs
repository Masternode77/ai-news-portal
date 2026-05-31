import fs from 'node:fs';
import path from 'node:path';

export const ARTICLE_IMAGE_FIELDS = [
  'heroImage',
  'thumbnailImage',
  'ogImage',
  'generatedImage',
  'sourceImage',
  'image',
  'imageUrl',
  'image_url',
  'thumbnail',
];

const VARIANT_FIELDS = {
  hero: ['heroImage', 'generatedImage', 'image', 'thumbnailImage', 'ogImage', 'sourceImage', 'imageUrl', 'image_url', 'thumbnail'],
  thumbnail: ['thumbnailImage', 'heroImage', 'generatedImage', 'image', 'ogImage', 'sourceImage', 'imageUrl', 'image_url', 'thumbnail'],
  og: ['ogImage', 'heroImage', 'generatedImage', 'image', 'thumbnailImage', 'sourceImage', 'imageUrl', 'image_url', 'thumbnail'],
};

const SOURCE_IMAGE_FIELDS = [
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

const AI_IMAGE_PROVIDER_RE = /\b(?:chatgpt|image2|openai|gpt-image|nano|nanobanana|gemini|legacy-gemini)\b/i;
const PLACEHOLDER_IMAGE_PROVIDER_RE = /\b(?:local-placeholder|local-svg|category-fallback)\b/i;

function clean(value = '') {
  return String(value || '').trim();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function fallbackGeneratedImagePath(article = {}) {
  const id = clean(article.id).replace(/[^a-zA-Z0-9_-]/g, '');
  return id ? `/generated/${id}.svg` : '';
}

function variantCandidates(article = {}, variant = 'hero') {
  const fields = VARIANT_FIELDS[variant] || VARIANT_FIELDS.hero;
  return unique([
    ...fields.map((field) => article[field]),
    fallbackGeneratedImagePath(article),
  ]);
}

function sourceImageCandidates(article = {}, variant = 'hero') {
  const fields = unique([
    ...SOURCE_IMAGE_FIELDS,
    ...(VARIANT_FIELDS[variant] || VARIANT_FIELDS.hero),
  ]);
  return unique(fields.map((field) => article[field])).filter(isRemoteImage);
}

function imageProviderText(article = {}) {
  return [
    article.generatedImageProvider,
    article.imageProvider,
    article.image_source_provider,
    article.generatedImageModel,
    article.imageModel,
    article.imageStatus,
    article.image_status,
  ].map(clean).filter(Boolean).join(' ');
}

function imageProviderLooksAi(article = {}) {
  return AI_IMAGE_PROVIDER_RE.test(imageProviderText(article));
}

function imageProviderLooksPlaceholder(article = {}) {
  return PLACEHOLDER_IMAGE_PROVIDER_RE.test(imageProviderText(article));
}

function sourceImageProviderFor(article = {}) {
  return clean(article.image_source_provider) || 'source-image';
}

function imageProviderFor(article = {}, status = 'available') {
  if (status === 'source') return sourceImageProviderFor(article);
  if (status === 'placeholder' || status === 'fallback') return 'local-placeholder';
  return clean(article.generatedImageProvider || article.imageProvider || article.image_source_provider) || 'local';
}

function isGeneratedPath(image = '') {
  return /^\/generated\//i.test(clean(image));
}

function articleHasSourceImage(article = {}) {
  return sourceImageCandidates(article).length > 0;
}

function isPlaceholderGeneratedCandidate(article = {}, image = '') {
  const value = clean(image);
  if (!isGeneratedPath(value)) return false;
  if (imageProviderLooksAi(article)) return false;
  if (imageProviderLooksPlaceholder(article)) return true;
  return articleHasSourceImage(article) || /\.svg(?:$|[?#])/i.test(value);
}

function isTrustedPublicImage(image = '') {
  const value = clean(image);
  return Boolean(value && (isRemoteImage(value) || value.startsWith('/')));
}

function imageVariantObject(article = {}, variant = 'hero') {
  const candidates = variantCandidates(article, variant);
  const sourceCandidates = sourceImageCandidates(article, variant);

  for (const candidate of candidates) {
    if (sourceCandidates.includes(candidate)) continue;
    if (!isTrustedPublicImage(candidate) || isPlaceholderGeneratedCandidate(article, candidate)) continue;
    return {
      url: candidate,
      alt: articleImageAlt(article),
      status: clean(article.imageStatus || article.image_status) || 'available',
      provider: imageProviderFor(article),
      variant,
      fallback: false,
    };
  }

  for (const candidate of sourceCandidates) {
    return {
      url: candidate,
      alt: articleImageAlt(article),
      status: 'source',
      provider: sourceImageProviderFor(article),
      variant,
      fallback: false,
    };
  }

  for (const candidate of candidates) {
    if (!isTrustedPublicImage(candidate)) continue;
    const placeholder = isPlaceholderGeneratedCandidate(article, candidate);
    return {
      url: candidate,
      alt: articleImageAlt(article),
      status: clean(article.imageStatus || article.image_status) || (placeholder ? 'placeholder' : 'available'),
      provider: imageProviderFor(article, placeholder ? 'placeholder' : 'available'),
      variant,
      fallback: placeholder,
    };
  }

  return {
    url: '',
    alt: articleImageAlt(article),
    status: 'missing',
    provider: '',
    variant,
    fallback: true,
  };
}

export function articleImageVariants(article = {}) {
  return {
    hero: imageVariantObject(article, 'hero'),
    thumbnail: imageVariantObject(article, 'thumbnail'),
    og: imageVariantObject(article, 'og'),
  };
}

export function articleHeroImage(article = {}) {
  return articleImageVariants(article).hero.url;
}

export function articleCardImage(article = {}) {
  return articleImageVariants(article).thumbnail.url;
}

export function articleOpenGraphImage(article = {}) {
  return articleImageVariants(article).og.url;
}

export function articleDisplayImage(article = {}) {
  return articleHeroImage(article);
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
  return Boolean(localPath && fs.existsSync(localPath));
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
