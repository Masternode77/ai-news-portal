import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { articleImageAltText, imageSlugPart } from './article-image-prompt.mjs';

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

function publicPathToFile(publicDir, publicPath) {
  return path.join(publicDir, publicPath.replace(/^\//, ''));
}

function escapeXml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colorFromSlug(slug = 'article-image') {
  let hash = 0;
  for (const char of slug) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const a = Math.abs(hash);
  return {
    one: `rgb(${34 + (a % 70)} ${70 + (a % 80)} ${92 + (a % 90)})`,
    two: `rgb(${42 + (a % 60)} ${118 + (a % 80)} ${128 + (a % 70)})`,
    three: `rgb(${134 + (a % 60)} ${103 + (a % 55)} ${64 + (a % 45)})`,
  };
}

function fallbackSvg(article = {}, variant, slug) {
  const palette = colorFromSlug(slug);
  const pad = Math.round(variant.width * 0.07);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${variant.width}" height="${variant.height}" viewBox="0 0 ${variant.width} ${variant.height}" role="img" aria-label="${escapeXml(articleImageAltText(article))}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${palette.one}"/>
      <stop offset="0.48" stop-color="#111820"/>
      <stop offset="1" stop-color="#080b10"/>
    </linearGradient>
    <filter id="soft">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
  </defs>
  <rect width="${variant.width}" height="${variant.height}" rx="${Math.round(variant.width * 0.025)}" fill="url(#bg)"/>
  <circle cx="${Math.round(variant.width * 0.2)}" cy="${Math.round(variant.height * 0.16)}" r="${Math.round(variant.width * 0.16)}" fill="${palette.two}" opacity="0.28" filter="url(#soft)"/>
  <circle cx="${Math.round(variant.width * 0.82)}" cy="${Math.round(variant.height * 0.2)}" r="${Math.round(variant.width * 0.13)}" fill="${palette.three}" opacity="0.24" filter="url(#soft)"/>
  <g stroke="rgba(255,255,255,0.09)" stroke-width="1">
    <path d="M${pad} ${Math.round(variant.height * 0.76)}H${variant.width - pad}"/>
    <path d="M${pad} ${Math.round(variant.height * 0.64)}H${variant.width - pad}"/>
    <path d="M${Math.round(variant.width * 0.18)} ${pad}V${variant.height - pad}"/>
    <path d="M${Math.round(variant.width * 0.48)} ${pad}V${variant.height - pad}"/>
    <path d="M${Math.round(variant.width * 0.76)} ${pad}V${variant.height - pad}"/>
  </g>
  <path d="M${pad} ${Math.round(variant.height * 0.72)}C${Math.round(variant.width * 0.24)} ${Math.round(variant.height * 0.58)}, ${Math.round(variant.width * 0.35)} ${Math.round(variant.height * 0.54)}, ${Math.round(variant.width * 0.48)} ${Math.round(variant.height * 0.58)}C${Math.round(variant.width * 0.62)} ${Math.round(variant.height * 0.62)}, ${Math.round(variant.width * 0.74)} ${Math.round(variant.height * 0.48)}, ${variant.width - pad} ${Math.round(variant.height * 0.3)}" stroke="#edf4ff" stroke-opacity="0.5" stroke-width="${Math.max(3, Math.round(variant.width / 360))}" fill="none"/>
  <g fill="none" stroke="${palette.three}" stroke-opacity="0.62" stroke-width="${Math.max(2, Math.round(variant.width / 420))}">
    <path d="M${Math.round(variant.width * 0.12)} ${Math.round(variant.height * 0.24)}H${Math.round(variant.width * 0.34)}V${Math.round(variant.height * 0.44)}H${Math.round(variant.width * 0.62)}"/>
    <path d="M${Math.round(variant.width * 0.26)} ${Math.round(variant.height * 0.84)}V${Math.round(variant.height * 0.66)}H${Math.round(variant.width * 0.86)}"/>
  </g>
  <rect x="${pad}" y="${pad}" width="${variant.width - pad * 2}" height="${variant.height - pad * 2}" rx="${Math.round(variant.width * 0.02)}" stroke="rgba(255,255,255,0.14)" fill="rgba(255,255,255,0.03)"/>
</svg>`;
}

export async function writeFallbackArticleImageSet(article = {}, metadata = {}, options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const paths = canonicalArticleImagePaths(article, { extension: 'webp', legacyExtension: 'webp' });
  const slug = paths.slug;
  const writes = Object.entries(ARTICLE_IMAGE_VARIANTS).map(async ([key, variant]) => {
    const publicPath = paths[`${key}Image`];
    const filePath = publicPathToFile(publicDir, publicPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await sharp(Buffer.from(fallbackSvg(article, variant, slug)))
      .webp({ quality: 88 })
      .toFile(filePath);
  });

  const legacyFile = publicPathToFile(publicDir, paths.legacyImage);
  await fs.mkdir(path.dirname(legacyFile), { recursive: true });
  await sharp(Buffer.from(fallbackSvg(article, ARTICLE_IMAGE_VARIANTS.hero, slug)))
    .webp({ quality: 88 })
    .toFile(legacyFile);
  await Promise.all(writes);

  return { ...metadata, ...paths };
}

export async function writeArticleImageSetFromBytes(article = {}, bytes, metadata = {}, options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const paths = canonicalArticleImagePaths(article, { extension: 'webp', legacyExtension: 'webp' });
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  for (const [key, variant] of Object.entries(ARTICLE_IMAGE_VARIANTS)) {
    const publicPath = paths[`${key}Image`];
    const filePath = publicPathToFile(publicDir, publicPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await sharp(buffer)
      .resize(variant.width, variant.height, { fit: 'cover', position: 'attention' })
      .webp({ quality: 88 })
      .toFile(filePath);
  }

  const legacyFile = publicPathToFile(publicDir, paths.legacyImage);
  await fs.mkdir(path.dirname(legacyFile), { recursive: true });
  await sharp(buffer)
    .resize(ARTICLE_IMAGE_VARIANTS.hero.width, ARTICLE_IMAGE_VARIANTS.hero.height, { fit: 'cover', position: 'attention' })
    .webp({ quality: 88 })
    .toFile(legacyFile);

  return { ...metadata, ...paths };
}
