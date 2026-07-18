import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGE_PROVIDER, PIPELINE_OFFLINE } from './constants.mjs';
import {
  ARTICLE_IMAGE_VARIANTS,
  canonicalArticleImagePaths,
  writeArticleImageSetFromBytes,
} from './image-store.mjs';
import { createImageProvider } from './image-providers/index.mjs';
import {
  ensureGeneratedOutDir,
  fetchWithTimeout,
  safeGeneratedImageId,
  SUPPORTED_RASTER_MIME_TYPES,
  validateRasterImageBytes,
} from './image-providers/shared.mjs';
import { localArticleImagePath } from './article-image-surface.mjs';
import { isStockDerivedCardImage } from './stock-card-image-detector.mjs';
import { publicFilePath, writeSafePublicFile } from './safe-public-file.mjs';

const MAX_SOURCE_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_IMAGE_PIXELS = 40_000_000;

function colorFromId(id = 'abcdef1234567890') {
  const digest = crypto.createHash('sha256').update(String(id || 'abcdef1234567890')).digest();
  const [a, b, c, d, e, f, g, h, i] = digest;

  return {
    one: `rgb(${40 + (a % 120)} ${64 + (b % 120)} ${96 + (c % 100)})`,
    two: `rgb(${90 + (d % 120)} ${70 + (e % 100)} ${110 + (f % 100)})`,
    three: `rgb(${90 + (g % 80)} ${160 + (h % 70)} ${190 + (i % 40)})`,
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeText(text = '', max = 72) {
  return (text || '').replace(/[<>&"']/g, ' ').trim().slice(0, max);
}

function wrapText(text = '', maxChars = 28, maxLines = 3) {
  const words = safeText(text, maxChars * maxLines * 2).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }

    if (lines.length === maxLines) break;
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  return lines;
}

function svgTextLines(lines = [], { x, y, size, lineHeight, fill, weight = 700, family = 'Inter, Arial, sans-serif', letterSpacing = 0 }) {
  const tspans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${safeText(line, 120)}</tspan>`)
    .join('');

  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}">${tspans}</text>`;
}

function localEditorialSvg(item = {}, variant = ARTICLE_IMAGE_VARIANTS.hero) {
  const palette = colorFromId(item.id || 'abcdef1234567890');
  const width = variant.width;
  const height = variant.height;
  const pad = Math.round(width * 0.055);
  const midY = Math.round(height * 0.58);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Compute Current editorial visual">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${palette.one}"/>
      <stop offset="0.46" stop-color="#111820"/>
      <stop offset="1" stop-color="#05080d"/>
    </linearGradient>
    <radialGradient id="pulse" cx="50%" cy="50%" r="50%">
      <stop stop-color="${palette.three}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="${palette.three}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="${Math.max(12, Math.round(width / 80))}"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.18)}" r="${Math.round(width * 0.16)}" fill="${palette.two}" opacity="0.24" filter="url(#soft)"/>
  <circle cx="${Math.round(width * 0.84)}" cy="${Math.round(height * 0.24)}" r="${Math.round(width * 0.13)}" fill="url(#pulse)" filter="url(#soft)"/>
  <g stroke="rgba(240,248,255,0.12)" stroke-width="${Math.max(1, Math.round(width / 900))}">
    <path d="M${pad} ${Math.round(height * 0.74)}H${width - pad}"/>
    <path d="M${pad} ${Math.round(height * 0.62)}H${width - pad}"/>
    <path d="M${Math.round(width * 0.22)} ${pad}V${height - pad}"/>
    <path d="M${Math.round(width * 0.48)} ${pad}V${height - pad}"/>
    <path d="M${Math.round(width * 0.74)} ${pad}V${height - pad}"/>
  </g>
  <path d="M${pad} ${midY}C${Math.round(width * 0.23)} ${Math.round(height * 0.42)}, ${Math.round(width * 0.36)} ${Math.round(height * 0.74)}, ${Math.round(width * 0.5)} ${Math.round(height * 0.56)}S${Math.round(width * 0.74)} ${Math.round(height * 0.36)}, ${width - pad} ${Math.round(height * 0.24)}" fill="none" stroke="#f6f8ff" stroke-opacity="0.52" stroke-width="${Math.max(3, Math.round(width / 260))}"/>
  <g fill="none" stroke="${palette.three}" stroke-opacity="0.74" stroke-width="${Math.max(2, Math.round(width / 420))}">
    <path d="M${Math.round(width * 0.1)} ${Math.round(height * 0.28)}H${Math.round(width * 0.38)}V${Math.round(height * 0.44)}H${Math.round(width * 0.7)}"/>
    <path d="M${Math.round(width * 0.24)} ${Math.round(height * 0.84)}V${Math.round(height * 0.68)}H${Math.round(width * 0.88)}"/>
  </g>
  <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" rx="${Math.round(width * 0.022)}" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.13)"/>
</svg>`;
}

async function writeLocalEditorialRasterSet(item = {}) {
  const publicDir = path.join(process.cwd(), 'public');
  const paths = canonicalArticleImagePaths(item, { extension: 'webp', legacyExtension: 'webp' });
  for (const [key, variant] of Object.entries(ARTICLE_IMAGE_VARIANTS)) {
    const publicPath = paths[`${key}Image`];
    const outPath = publicFilePath(publicDir, publicPath);
    const output = await sharp(Buffer.from(localEditorialSvg(item, variant)))
      .webp({ quality: 88 })
      .toBuffer();
    await writeSafePublicFile(publicDir, outPath, output);
  }

  const legacyPath = publicFilePath(publicDir, paths.legacyImage);
  const legacyOutput = await sharp(Buffer.from(localEditorialSvg(item, ARTICLE_IMAGE_VARIANTS.hero)))
    .webp({ quality: 88 })
    .toBuffer();
  await writeSafePublicFile(publicDir, legacyPath, legacyOutput);

  return paths;
}

async function writeLocalEditorialImageSet(item) {
  const paths = await writeLocalEditorialRasterSet(item);
  return {
    ...paths,
    provider: 'local-placeholder',
    model: 'local-raster',
    status: 'fallback',
    error: '',
  };
}

function normalizeImageResult(item = {}, result, metadata = {}, options = {}) {
  const value = typeof result === 'string' ? { heroImage: result } : (result || {});
  const fresh = options.fresh === true;
  const heroImage = value.heroImage
    || value.generatedImage
    || (fresh ? '' : item.heroImage || item.generatedImage || '');
  if (!heroImage) return null;
  const valueHas = (field) => Object.prototype.hasOwnProperty.call(value, field);
  const metadataHas = (field) => Object.prototype.hasOwnProperty.call(metadata, field);
  const scalar = (field, itemField, fallback = '') => {
    if (valueHas(field)) return value[field] ?? fallback;
    if (metadataHas(field)) return metadata[field] ?? fallback;
    return fresh ? fallback : (item[itemField] ?? fallback);
  };
  return {
    heroImage,
    thumbnailImage: value.thumbnailImage || (fresh ? heroImage : item.thumbnailImage || heroImage),
    ogImage: value.ogImage || (fresh ? heroImage : item.ogImage || heroImage),
    legacyImage: value.legacyImage || (fresh ? heroImage : item.legacyImage || heroImage),
    prompt: value.prompt || item.imagePrompt || '',
    alt: value.alt || item.imageAlt || '',
    provider: scalar('provider', 'generatedImageProvider', fresh ? '' : item.imageProvider || 'local-placeholder'),
    model: scalar('model', 'generatedImageModel', fresh ? '' : item.imageModel || 'local-raster'),
    status: scalar('status', 'imageStatus', fresh ? 'generated' : 'generated'),
    error: scalar('error', 'imageError', ''),
    generatedAt: scalar('generatedAt', 'imageGeneratedAt', ''),
  };
}

function withStageFailures(result, failures = []) {
  if (!result || failures.length === 0) return result;
  const reasons = [result.error, ...failures].filter(Boolean).join('; ').slice(0, 500);
  return { ...result, error: reasons };
}

export function imageMetadataPatch(result = {}) {
  const normalized = normalizeImageResult({}, result);
  if (!normalized) return {};
  return {
    generatedImage: normalized.heroImage,
    heroImage: normalized.heroImage,
    thumbnailImage: normalized.thumbnailImage,
    ogImage: normalized.ogImage,
    legacyImage: normalized.legacyImage,
    imagePrompt: normalized.prompt,
    imageAlt: normalized.alt,
    generatedImageProvider: normalized.provider,
    generatedImageModel: normalized.model,
    imageProvider: normalized.provider,
    imageModel: normalized.model,
    imageStatus: normalized.status,
    imageError: normalized.error,
    imageGeneratedAt: normalized.generatedAt,
  };
}

export async function writeSourcePosterImageSet(item, bytes, mime = '', options = {}) {
  const validated = await validateRasterImageBytes(
    bytes,
    mime,
    { maxBytes: MAX_SOURCE_IMAGE_BYTES, maxPixels: MAX_SOURCE_IMAGE_PIXELS },
  );
  const imageId = safeGeneratedImageId(item);
  const palette = colorFromId(imageId);
  const titleLines = wrapText(item.title, 34, 3);
  const category = safeText(item.category || 'AI Infrastructure Brief', 32);
  const source = safeText(item.source || 'Curated source', 28);
  const summaryLines = wrapText(item.summary || item.snippet || '', 72, 2);

  const overlaySvg = Buffer.from(`
    <svg width="1344" height="768" viewBox="0 0 1344 768" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette.one}" stop-opacity="0.18" />
          <stop offset="0.5" stop-color="#071019" stop-opacity="0.72" />
          <stop offset="1" stop-color="#05070c" stop-opacity="0.94" />
        </linearGradient>
      </defs>
      <rect width="1344" height="768" fill="url(#wash)" />
      <rect x="48" y="48" width="1248" height="672" rx="34" fill="none" stroke="rgba(255,255,255,0.14)" />
      <text x="92" y="132" fill="#d8e6ff" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2">${category}</text>
      ${svgTextLines(titleLines, { x: 92, y: 232, size: 56, lineHeight: 62, fill: '#ffffff', weight: 800, family: 'Arial, sans-serif' })}
      <text x="92" y="${298 + Math.max(0, titleLines.length - 1) * 62}" fill="#d7e4fb" font-family="Arial, sans-serif" font-size="28" font-weight="500">${source}</text>
      ${svgTextLines(summaryLines, { x: 92, y: 610, size: 24, lineHeight: 32, fill: '#bbcae2', weight: 500, family: 'Arial, sans-serif' })}
    </svg>
  `);

  const output = await sharp(validated.bytes, {
    failOn: 'error',
    limitInputPixels: MAX_SOURCE_IMAGE_PIXELS,
    animated: false,
    sequentialRead: true,
  })
    .rotate()
    .resize(1344, 768, {
      fit: 'cover',
      position: 'attention',
    })
    .modulate({ brightness: 0.82, saturation: 1.08 })
    .blur(0.3)
    .composite([{ input: overlaySvg }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return writeArticleImageSetFromBytes(item, output, {
    provider: 'source',
    model: 'publisher-artwork',
    status: 'source',
    error: '',
  }, {
    publicDir: options.publicDir || path.join(process.cwd(), 'public'),
    mimeType: 'image/jpeg',
  });
}

async function generateLocalPoster(item) {
  if (PIPELINE_OFFLINE) {
    return null;
  }

  const sourceImage = item.sourceImage || item.image || null;
  if (!sourceImage) {
    return null;
  }

  const response = await fetchWithTimeout(sourceImage, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; AINewsPortalBot/1.0)',
    },
    safeFetch: {
      allowedMimeTypes: SUPPORTED_RASTER_MIME_TYPES,
      maxRedirects: 3,
      maxCompressedBytes: MAX_SOURCE_IMAGE_BYTES,
      maxDecompressedBytes: MAX_SOURCE_IMAGE_BYTES,
    },
  }, 20000);

  if (!response.ok) {
    throw new Error(`Source image fetch failed: ${response.status}`);
  }

  const result = await writeSourcePosterImageSet(
    item,
    Buffer.from(await response.arrayBuffer()),
    response.headers.get('content-type') || '',
  );
  return result;
}

export async function needsImageRefresh(item) {
  if (item?.forceImageRefresh || item?.forceAiImage) return true;
  if (isStockDerivedCardImage(item)) return true;
  const providerText = [
    item?.generatedImageProvider,
    item?.imageProvider,
    item?.image_source_provider,
    item?.generatedImageModel,
    item?.imageModel,
    item?.imageStatus,
    item?.image_status,
  ].filter(Boolean).join(' ');
  if (/\b(?:local-placeholder|local-svg|category-fallback|fallback|placeholder)\b/i.test(providerText)) return true;
  if (!item?.generatedImage) return true;
  if (/^https?:\/\//i.test(item.generatedImage)) return true;
  if (/^\/generated\/fallbacks\//i.test(item.generatedImage)) return true;
  if (/\.svg(?:$|[?#])/i.test(item.generatedImage)) return true;
  const localPath = localArticleImagePath(item.generatedImage);
  if (!localPath) return true;
  if (!(await fileExists(localPath))) return true;
  if (localPath.endsWith('.svg')) {
    const svg = await fs.readFile(localPath, 'utf8').catch(() => '');
    if (svg.includes('Fallback editorial artwork generated locally')) return true;
  }
  return false;
}

export function imageGenerationStages(item = {}) {
  if (item?.requireProviderImage) return ['provider'];
  const hasSourceImage = Boolean(item?.sourceImage || item?.image);
  if (!hasSourceImage) return ['provider', 'local'];

  return item?.forceAiImage
    ? ['provider', 'source', 'local']
    : ['source', 'provider', 'local'];
}

export async function ensureArticleImageResult(item, options = {}) {
  await ensureGeneratedOutDir();
  const offline = options.offline ?? PIPELINE_OFFLINE;
  const stageFailures = [];
  const recordFailure = (stage, detail) => {
    const message = String(detail?.message || detail || 'unavailable').replace(/\s+/g, ' ').trim();
    stageFailures.push(`${stage}: ${message.slice(0, 220)}`);
  };

  if (!(await needsImageRefresh(item))) {
    return normalizeImageResult(item, item.generatedImage);
  }

  if (item?.forcePlaceholderImage) {
    const local = await (options.generateLocal || writeLocalEditorialImageSet)(item);
    return normalizeImageResult(item, local, {
      provider: 'local-placeholder',
      model: 'local-raster',
      status: 'fallback',
    }, { fresh: true });
  }

  const provider = options.provider === undefined ? createImageProvider() : options.provider;
  const generateSource = options.generateSource || generateLocalPoster;
  const generateLocal = options.generateLocal || writeLocalEditorialImageSet;

  for (const stage of imageGenerationStages(item)) {
    if (stage === 'source') {
      try {
        const poster = await generateSource(item);
        if (poster) {
          const normalized = normalizeImageResult(item, poster, {
            provider: 'source',
            model: 'publisher-artwork',
            status: 'source',
          }, { fresh: true });
          if (!normalized) throw new Error('source returned no image path');
          return withStageFailures(normalized, stageFailures);
        }
      } catch (error) {
        recordFailure('source', error);
        console.error(`[pipeline] source poster fallback for ${item.id}: ${error.message}`);
      }
      continue;
    }

    if (stage === 'provider') {
      if (provider && !offline) {
        try {
          const generated = typeof provider.generateWithMetadata === 'function'
            ? await provider.generateWithMetadata(item)
            : await provider.generate(item);
          const normalized = normalizeImageResult(item, generated, {
            provider: provider.name,
            model: provider.model || '',
            status: 'generated',
            error: '',
          }, { fresh: true });
          if (!normalized) throw new Error(`${provider.name} returned no image path`);
          return withStageFailures(normalized, stageFailures);
        } catch (error) {
          if (item?.requireProviderImage) throw error;
          recordFailure('provider', error);
          console.error(`[pipeline] ${provider.name} image fallback for ${item.id}: ${error.message}`);
        }
      } else if (item?.requireProviderImage) {
        throw new Error(`IMAGE_PROVIDER="${IMAGE_PROVIDER}" is not fully configured`);
      } else if (IMAGE_PROVIDER !== 'local' && !offline) {
        recordFailure('provider', `IMAGE_PROVIDER="${IMAGE_PROVIDER}" is not fully configured`);
        console.warn(`[pipeline] IMAGE_PROVIDER="${IMAGE_PROVIDER}" is not fully configured; using local image fallback`);
      } else if (offline && IMAGE_PROVIDER !== 'local') {
        recordFailure('provider', 'pipeline offline');
      }
      continue;
    }

    const local = await generateLocal(item);
    return withStageFailures(normalizeImageResult(item, local, {
      provider: 'local-placeholder',
      model: 'local-raster',
      status: 'fallback',
    }, { fresh: true }), stageFailures);
  }

  const local = await generateLocal(item);
  return withStageFailures(normalizeImageResult(item, local, {
    provider: 'local-placeholder',
    model: 'local-raster',
    status: 'fallback',
  }, { fresh: true }), stageFailures);
}

export async function ensureArticleImage(item, options = {}) {
  const result = await ensureArticleImageResult(item, options);
  return result?.heroImage || '';
}
