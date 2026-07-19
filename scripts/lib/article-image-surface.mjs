import fs from 'node:fs';
import path from 'node:path';
import { canonicalArticleImagePaths } from './article-image-paths.mjs';

export const ARTICLE_IMAGE_FIELDS = [
  'heroImage',
  'generatedImage',
  'thumbnailImage',
  'ogImage',
  'sourceImage',
  'image',
  'imageUrl',
  'image_url',
  'thumbnail',
];

export const PUBLIC_IMAGE_FALLBACK_SLUGS = [
  'power-grid',
  'data-centers',
  'cloud-capacity',
  'semiconductors',
  'cooling',
  'capital-markets',
  'regulation',
  'supply-chain',
  'ai-infrastructure',
];

const VARIANT_FIELDS = {
  hero: ['heroImage', 'generatedImage', 'image', 'thumbnailImage', 'ogImage', 'sourceImage', 'imageUrl', 'image_url', 'thumbnail'],
  thumbnail: ['thumbnailImage', 'heroImage', 'generatedImage', 'image', 'ogImage', 'sourceImage', 'imageUrl', 'image_url', 'thumbnail'],
  og: ['ogImage', 'heroImage', 'generatedImage', 'image', 'thumbnailImage', 'sourceImage', 'imageUrl', 'image_url', 'thumbnail'],
};

const IMAGE_METADATA_FIELDS = [
  'imageAlt',
  'heroImage',
  'thumbnailImage',
  'ogImage',
  'legacyImage',
  'imageStatus',
  'imageError',
  'imageGeneratedAt',
  'imageModel',
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

function slugify(value = '') {
  return clean(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function categoryText(article = {}) {
  return [
    article.primary_category,
    article.category,
    article.defaultCategory,
    article.infrastructure_layer,
    article.public_routing?.laneTitle,
    ...(Array.isArray(article.tags) ? article.tags : []),
  ].map(clean).filter(Boolean).join(' ').toLowerCase();
}

export function fallbackCategorySlug(article = {}) {
  const values = [
    article.primary_category,
    article.category,
    article.defaultCategory,
    article.infrastructure_layer,
  ].map(slugify).filter(Boolean);
  for (const value of values) {
    if (PUBLIC_IMAGE_FALLBACK_SLUGS.includes(value)) return value;
  }

  const text = categoryText(article);
  if (/power|grid|energy|utility/.test(text)) return 'power-grid';
  if (/data[\s-]?center|colocation|facility|campus/.test(text)) return 'data-centers';
  if (/cloud|hyperscaler|region/.test(text)) return 'cloud-capacity';
  if (/semiconductor|chip|gpu|hbm|memory|accelerator|silicon/.test(text)) return 'semiconductors';
  if (/cooling|thermal/.test(text)) return 'cooling';
  if (/capital|finance|reit|deal|ipo|markets/.test(text)) return 'capital-markets';
  if (/policy|regulation|permit|siting|zoning/.test(text)) return 'regulation';
  if (/supply|supplier|equipment|construction/.test(text)) return 'supply-chain';
  return 'ai-infrastructure';
}

export function fallbackCategoryImagePath(article = {}) {
  return `/generated/fallbacks/${fallbackCategorySlug(article)}.svg`;
}

export function fallbackGeneratedImagePath(article = {}) {
  const id = clean(article.id).replace(/[^a-zA-Z0-9_-]/g, '');
  return id ? `/generated/${id}.svg` : '';
}

function canonicalVariantPath(article = {}, variant = 'hero') {
  const paths = canonicalArticleImagePaths(article, { extension: 'webp', legacyExtension: 'webp' });
  return paths[`${variant}Image`] || '';
}

function variantCandidates(article = {}, variant = 'hero') {
  const fields = VARIANT_FIELDS[variant] || VARIANT_FIELDS.hero;
  const explicit = fields.map((field) => article[field]);
  return unique([
    ...explicit,
    canonicalVariantPath(article, variant),
    fallbackGeneratedImagePath(article),
  ]);
}

function imageProviderFor(article = {}, status = 'available') {
  if (status === 'fallback') return 'category-fallback';
  return clean(article.generatedImageProvider || article.imageProvider || article.image_source_provider) || 'local';
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

function isPlaceholderGeneratedCandidate(article = {}, image = '') {
  const value = clean(image);
  if (!/^\/generated\//i.test(value)) return false;
  if (/^\/generated\/fallbacks\//i.test(value)) return true;
  if (imageProviderLooksPlaceholder(article)) return true;
  if (imageProviderLooksAi(article)) return false;
  return /\.svg(?:$|[?#])/i.test(value);
}

function imageVariantObject(article = {}, variant = 'hero') {
  const generatedCandidates = variantCandidates(article, variant);
  for (const candidate of generatedCandidates) {
    if (isTrustedPublicImage(candidate) && !isPlaceholderGeneratedCandidate(article, candidate)) {
      return {
        url: candidate,
        alt: articleImageAlt(article),
        status: clean(article.imageStatus || article.image_status) || 'available',
        provider: imageProviderFor(article),
        variant,
        fallback: false,
      };
    }
  }

  for (const candidate of generatedCandidates) {
    if (isTrustedPublicImage(candidate)) {
      const placeholder = isPlaceholderGeneratedCandidate(article, candidate);
      return {
        url: candidate,
        alt: articleImageAlt(article),
        status: clean(article.imageStatus || article.image_status) || (placeholder ? 'placeholder' : 'available'),
        provider: imageProviderFor(article),
        variant,
        fallback: placeholder,
      };
    }
  }

  const fallback = fallbackCategoryImagePath(article);
  const safeFallback = isTrustedPublicImage(fallback)
    ? fallback
    : '/generated/fallbacks/ai-infrastructure.svg';
  return {
    url: safeFallback,
    alt: articleImageAlt(article),
    status: 'fallback',
    provider: 'category-fallback',
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

export function articleImageProvenance(article = {}, variant = 'hero') {
  const variants = articleImageVariants(article);
  const selected = variants[variant] || variants.hero;
  const provider = clean(selected.provider);
  const normalizedProvider = provider.toLowerCase();
  const status = clean(selected.status);
  const source = status === 'source' || /^(?:source|source-image)$/.test(provider);
  const image2 = !source && normalizedProvider === 'image2';
  const ai = !source && !image2 && AI_IMAGE_PROVIDER_RE.test(provider);
  const kind = source ? 'source' : image2 ? 'image2' : ai ? 'ai' : 'fallback';
  const label = kind === 'source'
    ? 'Original source image'
    : kind === 'image2'
      ? 'ChatGPT Image2 visual'
      : kind === 'ai' && /gemini|nano/.test(normalizedProvider)
        ? 'Gemini generated visual'
        : kind === 'ai' && /chatgpt/.test(normalizedProvider)
          ? 'ChatGPT generated visual'
          : kind === 'ai' && /openai|gpt-image/.test(normalizedProvider)
            ? 'OpenAI generated visual'
            : kind === 'ai'
              ? 'AI generated visual'
              : 'Editorial fallback visual';
  return {
    label,
    kind,
    provider,
    status,
    variant: selected.variant || variant,
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
  const explicit = clean(article.imageAlt || article.image_alt);
  if (explicit) return explicit;
  const title = clean(article.expertLensFull?.finalHeadline || article.title);
  return title ? `${title} editorial visual` : 'Compute Current editorial visual';
}

export function isRemoteImage(image = '') {
  return /^https?:\/\//i.test(clean(image));
}

export function localArticleImagePath(image = '') {
  const value = clean(image);
  if (!value || isRemoteImage(value)) return '';
  if (!value.startsWith('/')) return '';
  const publicRoot = path.resolve(process.cwd(), 'public');
  const candidate = path.resolve(publicRoot, value.replace(/^\/+/, ''));
  const relative = path.relative(publicRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return '';

  try {
    const realPublicRoot = fs.realpathSync(publicRoot);
    const realCandidate = fs.realpathSync(candidate);
    const realRelative = path.relative(realPublicRoot, realCandidate);
    if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) return '';
    return realCandidate;
  } catch {
    let ancestor = path.dirname(candidate);
    while (ancestor.startsWith(publicRoot) && ancestor !== path.dirname(ancestor)) {
      try {
        const realPublicRoot = fs.realpathSync(publicRoot);
        const realAncestor = fs.realpathSync(ancestor);
        const realRelative = path.relative(realPublicRoot, realAncestor);
        if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) return '';
        return candidate;
      } catch {
        ancestor = path.dirname(ancestor);
      }
    }
    return '';
  }
}

export function localArticleImageExists(image = '') {
  const localPath = localArticleImagePath(image);
  return Boolean(localPath && fs.existsSync(localPath));
}

export function isTrustedPublicImage(image = '', options = {}) {
  const value = clean(image);
  if (!value) return false;
  if (/^\/admin(?:\/|$)/i.test(value)) return false;
  if (isRemoteImage(value)) return Boolean(options.allowRemote === true && options.remoteValidated === true);
  return localArticleImageExists(value);
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
    ...(metadata.heroImage ? { heroImage: metadata.heroImage } : {}),
    ...(metadata.thumbnailImage ? { thumbnailImage: metadata.thumbnailImage } : {}),
    ...(metadata.ogImage ? { ogImage: metadata.ogImage } : {}),
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
