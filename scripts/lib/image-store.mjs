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

function wrap(value = '', max = 28, lines = 3) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
    if (out.length === lines) break;
  }
  if (line && out.length < lines) out.push(line);
  return out;
}

function textLines(lines, { x, y, size, lineHeight, fill, weight = 800 }) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')}</text>`;
}

function fallbackSvg(article = {}, variant, slug) {
  const palette = colorFromSlug(slug);
  const title = article.expertLensFull?.finalHeadline || article.title || 'Compute Current';
  const category = article.primary_category || article.category || article.infrastructure_layer || 'AI Infrastructure';
  const source = article.source || 'Compute Current';
  const lines = wrap(title, variant.width >= 1400 ? 34 : 28, 3);
  const titleSize = Math.round(variant.width / 25);
  const labelSize = Math.round(variant.width / 72);
  const pad = Math.round(variant.width * 0.07);
  const baseline = Math.round(variant.height * 0.32);

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
  <rect x="${pad}" y="${pad}" width="${variant.width - pad * 2}" height="${variant.height - pad * 2}" rx="${Math.round(variant.width * 0.02)}" stroke="rgba(255,255,255,0.14)" fill="rgba(255,255,255,0.03)"/>
  <text x="${pad + 18}" y="${Math.round(variant.height * 0.18)}" fill="#dce8ff" font-family="Inter, Arial, sans-serif" font-size="${labelSize}" font-weight="800">${escapeXml(category)}</text>
  ${textLines(lines, { x: pad + 18, y: baseline, size: titleSize, lineHeight: Math.round(titleSize * 1.12), fill: '#ffffff' })}
  <text x="${pad + 18}" y="${variant.height - pad - 28}" fill="#c8d6ea" font-family="Inter, Arial, sans-serif" font-size="${labelSize}" font-weight="700">${escapeXml(source)}</text>
  <text x="${variant.width - pad - 190}" y="${variant.height - pad - 28}" fill="#c8d6ea" font-family="Inter, Arial, sans-serif" font-size="${labelSize}" font-weight="700">Compute Current</text>
</svg>`;
}

export async function writeFallbackArticleImageSet(article = {}, metadata = {}, options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const paths = canonicalArticleImagePaths(article, { extension: 'svg', legacyExtension: 'svg' });
  const slug = paths.slug;
  const writes = Object.entries(ARTICLE_IMAGE_VARIANTS).map(async ([key, variant]) => {
    const publicPath = paths[`${key}Image`];
    const filePath = publicPathToFile(publicDir, publicPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, fallbackSvg(article, variant, slug), 'utf8');
  });

  const legacyFile = publicPathToFile(publicDir, paths.legacyImage);
  await fs.mkdir(path.dirname(legacyFile), { recursive: true });
  try {
    await fs.access(legacyFile);
  } catch {
    await fs.writeFile(legacyFile, fallbackSvg(article, ARTICLE_IMAGE_VARIANTS.hero, slug), 'utf8');
  }
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
