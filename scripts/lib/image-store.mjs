import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

function visualIdentity(article = {}, slug = 'article-image') {
  const stable = JSON.stringify({
    id: article.id || slug,
    title: article.expertLensFull?.finalHeadline || article.title || '',
    source: article.sourceUrl || article.source || article.sourceRegistryId || '',
    category: article.primary_category || article.category || article.infrastructure_layer || '',
    tags: Array.isArray(article.tags) ? article.tags : [],
  });
  const digest = createHash('sha256').update(stable).digest();
  const a = digest[0] * 256 + digest[1];
  return {
    digest,
    one: `rgb(${15 + (a % 28)} ${43 + (digest[2] % 46)} ${75 + (digest[3] % 58)})`,
    two: `rgb(${72 + (digest[4] % 58)} ${132 + (digest[5] % 68)} ${182 + (digest[6] % 58)})`,
    three: `rgb(${167 + (digest[7] % 44)} ${210 + (digest[8] % 34)} ${244 + (digest[9] % 12)})`,
  };
}

export function editorialArtworkDescriptor(article = {}) {
  const tags = Array.isArray(article.tags) ? article.tags : [];
  const classify = (text) => {
    if (/cooling|thermal|ventilation/.test(text)) return 'cooling';
    if (/nuclear|reactor|uranium/.test(text)) return 'nuclear';
    if (/solar|photovoltaic|battery/.test(text)) return 'solar';
    if (/oil|gas|fuel|storage|supply/.test(text)) return 'supply';
    if (/ercot|pjm|virginia|texas|regional|peak/.test(text)) return 'regional';
    if (/data[\s-]?center|server|compute|computing|survey/.test(text)) return 'compute';
    if (/grid|electric|power|utility|generation|transmission|interconnect|load|demand/.test(text)) return 'grid';
    return '';
  };
  const subject = [article.title, article.primary_category, article.category, article.infrastructure_layer]
    .filter(Boolean).join(' ').toLowerCase();
  return { topic: classify(subject) || classify(tags.join(' ').toLowerCase()) || 'network' };
}

function titleLines(article = {}) {
  const words = String(article.expertLensFull?.finalHeadline || article.title || 'Infrastructure signal')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return [words.slice(0, 5).join(' '), words.slice(5, 10).join(' ')].filter(Boolean).map(escapeXml);
}

function topicMotif(topic, width, height, pad, digest) {
  const stroke = Math.max(2, Math.round(width / 420));
  const x = (ratio) => Math.round(width * ratio);
  const y = (ratio) => Math.round(height * ratio);
  if (topic === 'cooling') {
    return `<g fill="none" stroke="rgba(233,246,255,0.76)" stroke-width="${stroke}" stroke-linecap="round"><path d="M${x(0.16)} ${y(0.34)}C${x(0.3)} ${y(0.16)},${x(0.42)} ${y(0.52)},${x(0.56)} ${y(0.34)}S${x(0.78)} ${y(0.16)},${x(0.88)} ${y(0.38)}"/><path d="M${x(0.12)} ${y(0.64)}C${x(0.28)} ${y(0.46)},${x(0.46)} ${y(0.82)},${x(0.6)} ${y(0.62)}S${x(0.78)} ${y(0.44)},${x(0.9)} ${y(0.64)}"/></g>`;
  }
  if (topic === 'nuclear') {
    const radius = Math.max(16, Math.round(width / 14));
    return `<g fill="none" stroke="rgba(233,246,255,0.76)" stroke-width="${stroke}"><circle cx="${x(0.5)}" cy="${y(0.52)}" r="${radius}"/><ellipse cx="${x(0.5)}" cy="${y(0.52)}" rx="${Math.round(radius * 1.45)}" ry="${Math.round(radius * 0.55)}" transform="rotate(32 ${x(0.5)} ${y(0.52)})"/><ellipse cx="${x(0.5)}" cy="${y(0.52)}" rx="${Math.round(radius * 1.45)}" ry="${Math.round(radius * 0.55)}" transform="rotate(-32 ${x(0.5)} ${y(0.52)})"/></g>`;
  }
  if (topic === 'solar') {
    return `<g fill="none" stroke="rgba(233,246,255,0.76)" stroke-width="${stroke}"><circle cx="${x(0.74)}" cy="${y(0.28)}" r="${Math.max(14, Math.round(width / 26))}"/><path d="M${x(0.2)} ${y(0.74)}L${x(0.7)} ${y(0.6)}L${x(0.78)} ${y(0.8)}L${x(0.28)} ${y(0.9)}Z M${x(0.32)} ${y(0.71)}L${x(0.4)} ${y(0.87)}M${x(0.48)} ${y(0.66)}L${x(0.56)} ${y(0.83)}M${x(0.63)} ${y(0.63)}L${x(0.71)} ${y(0.8)}"/></g>`;
  }
  if (topic === 'regional') {
    return `<g fill="none" stroke="rgba(233,246,255,0.76)" stroke-width="${stroke}"><circle cx="${x(0.28)}" cy="${y(0.46)}" r="${Math.max(12, Math.round(width / 42))}"/><circle cx="${x(0.55)}" cy="${y(0.3)}" r="${Math.max(12, Math.round(width / 42))}"/><circle cx="${x(0.75)}" cy="${y(0.66)}" r="${Math.max(12, Math.round(width / 42))}"/><path d="M${x(0.34)} ${y(0.42)}L${x(0.49)} ${y(0.34)}L${x(0.69)} ${y(0.62)}M${x(0.28)} ${y(0.6)}V${y(0.8)}H${x(0.75)}"/></g>`;
  }
  if (topic === 'grid') {
    return `<g fill="none" stroke="rgba(233,246,255,0.7)" stroke-width="${stroke}" stroke-linecap="round"><path d="M${x(0.2)} ${y(0.78)}L${x(0.32)} ${y(0.28)}L${x(0.44)} ${y(0.78)}M${x(0.56)} ${y(0.78)}L${x(0.68)} ${y(0.22)}L${x(0.8)} ${y(0.78)}"/><path d="M${x(0.15)} ${y(0.44)}H${x(0.85)}M${x(0.23)} ${y(0.56)}H${x(0.77)}"/></g>`;
  }
  if (topic === 'compute') {
    const size = Math.round(width * 0.12);
    return `<g fill="none" stroke="rgba(233,246,255,0.72)" stroke-width="${stroke}"><rect x="${x(0.28)}" y="${y(0.3)}" width="${size}" height="${size}" rx="${Math.round(size * 0.12)}"/><rect x="${x(0.51)}" y="${y(0.47)}" width="${size}" height="${size}" rx="${Math.round(size * 0.12)}"/><path d="M${x(0.4)} ${y(0.42)}L${x(0.51)} ${y(0.54)}M${x(0.4)} ${y(0.54)}L${x(0.51)} ${y(0.6)}"/></g>`;
  }
  if (topic === 'supply') {
    return `<g fill="none" stroke="rgba(233,246,255,0.7)" stroke-width="${stroke}" stroke-linecap="round"><path d="M${pad} ${y(0.62)}H${x(0.3)}L${x(0.42)} ${y(0.42)}H${x(0.66)}L${width - pad} ${y(0.24)}"/><circle cx="${x(0.3)}" cy="${y(0.62)}" r="${Math.max(6, Math.round(width / 105))}"/><circle cx="${x(0.66)}" cy="${y(0.42)}" r="${Math.max(6, Math.round(width / 105))}"/></g>`;
  }
  return `<g fill="none" stroke="rgba(233,246,255,0.7)" stroke-width="${stroke}"><path d="M${pad} ${y(0.7)}C${x(0.3)} ${y(0.35)},${x(0.5)} ${y(0.78)},${width - pad} ${y(0.3)}"/><circle cx="${x(0.32)}" cy="${y(0.43)}" r="${Math.max(5, digest[10] % 18)}"/><circle cx="${x(0.68)}" cy="${y(0.54)}" r="${Math.max(5, digest[11] % 18)}"/></g>`;
}

function fallbackSvg(article = {}, variant, slug) {
  const palette = visualIdentity(article, slug);
  const { topic } = editorialArtworkDescriptor(article);
  const lines = titleLines(article);
  const pad = Math.round(variant.width * 0.07);
  const titleSize = Math.max(18, Math.round(variant.width / 34));
  const title = lines.map((line, index) => `<tspan x="${pad}" dy="${index ? Math.round(titleSize * 1.16) : 0}">${line}</tspan>`).join('');
  const accentX = Math.round(variant.width * (0.17 + (palette.digest[12] / 255) * 0.66));
  const accentY = Math.round(variant.height * (0.2 + (palette.digest[13] / 255) * 0.48));

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
  <circle cx="${accentX}" cy="${accentY}" r="${Math.max(8, Math.round(variant.width / 82))}" fill="${palette.three}" opacity="0.86"/>
  <g stroke="rgba(255,255,255,0.09)" stroke-width="1">
    <path d="M${pad} ${Math.round(variant.height * 0.76)}H${variant.width - pad}"/>
    <path d="M${pad} ${Math.round(variant.height * 0.64)}H${variant.width - pad}"/>
    <path d="M${Math.round(variant.width * 0.18)} ${pad}V${variant.height - pad}"/>
    <path d="M${Math.round(variant.width * 0.48)} ${pad}V${variant.height - pad}"/>
    <path d="M${Math.round(variant.width * 0.76)} ${pad}V${variant.height - pad}"/>
  </g>
  ${topicMotif(topic, variant.width, variant.height, pad, palette.digest)}
  <text x="${pad}" y="${Math.round(variant.height * 0.14)}" fill="rgba(234,244,255,0.74)" font-family="Arial, sans-serif" font-size="${Math.max(10, Math.round(variant.width / 90))}" font-weight="700" letter-spacing="${Math.max(1, Math.round(variant.width / 900))}">COMPUTE CURRENT / ${escapeXml(topic.toUpperCase())}</text>
  <text x="${pad}" y="${Math.round(variant.height * 0.84)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700">${title}</text>
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
