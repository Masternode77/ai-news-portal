import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGE_PROVIDER, PIPELINE_OFFLINE } from './constants.mjs';
import { writeFallbackArticleImageSet } from './image-store.mjs';
import { createImageProvider } from './image-providers/index.mjs';
import { isStockDerivedCardImage } from './stock-card-image-detector.mjs';
import { loadSourceRegistry, sourceUsageDecision } from './source-registry.mjs';
import { fetchSourceImage, sourceImageHostsFor } from './source-image-fetcher.mjs';

// allow: SIZE_OK — generation and its fail-closed publisher-image fallback share one orchestration boundary.

const OUT_DIR = path.join(process.cwd(), 'public/generated');

function colorFromId(id = 'abcdef1234567890') {
  const a = parseInt(id.slice(0, 2), 16) || 64;
  const b = parseInt(id.slice(2, 4), 16) || 96;
  const c = parseInt(id.slice(4, 6), 16) || 128;

  return {
    one: `rgb(${40 + (a % 120)} ${64 + (b % 120)} ${96 + (c % 100)})`,
    two: `rgb(${90 + (c % 120)} ${70 + (a % 100)} ${110 + (b % 100)})`,
    three: `rgb(${90 + (b % 80)} ${160 + (c % 70)} ${190 + (a % 40)})`,
  };
}

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
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

async function writeLocalEditorialImageSet(item) {
  const paths = await writeFallbackArticleImageSet(item);
  return paths.heroImage;
}

async function generateLocalPoster(item) {
  if (PIPELINE_OFFLINE) {
    return null;
  }

  const sourceImage = item.sourceImage || item.image || null;
  if (!sourceImage) {
    return null;
  }

  const sources = await loadSourceRegistry();
  const authorization = sourceUsageDecision(item, sources, 'image');
  if (!authorization.authorized) {
    console.warn(`[pipeline] ${authorization.reason} for ${item.id}: ${authorization.detail}`);
    return null;
  }

  const fetched = await fetchSourceImage(sourceImage, {
    allowedHosts: sourceImageHostsFor(sources, authorization.sourceId),
  });
  const palette = colorFromId(item.id);
  const titleLines = wrapText(item.title, 34, 3);
  const category = safeText(item.category || 'AI Infrastructure Brief', 32);
  const source = safeText(item.source || 'Curated source', 28);
  const summaryLines = wrapText(item.summary || item.snippet || '', 72, 2);
  const filename = `${item.id}.jpg`;
  const outPath = path.join(OUT_DIR, filename);

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

  await sharp(fetched.bytes)
    .resize(1344, 768, {
      fit: 'cover',
      position: 'attention',
    })
    .modulate({ brightness: 0.82, saturation: 1.08 })
    .blur(0.3)
    .composite([{ input: overlaySvg }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);

  return `/generated/${filename}`;
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
  const localPath = path.join(process.cwd(), 'public', item.generatedImage.replace(/^\//, ''));
  if (!(await fileExists(localPath))) return true;
  if (localPath.endsWith('.svg')) {
    const svg = await fs.readFile(localPath, 'utf8').catch(() => '');
    if (svg.includes('Fallback editorial artwork generated locally')) return true;
  }
  return false;
}

export async function ensureArticleImage(item) {
  await ensureOutDir();

  if (!(await needsImageRefresh(item))) {
    return item.generatedImage;
  }

  if (item?.forcePlaceholderImage) {
    return writeLocalEditorialImageSet(item);
  }

  const provider = createImageProvider();

  if (provider && !PIPELINE_OFFLINE) {
    try {
      return await provider.generate(item);
    } catch (error) {
      console.error(`[pipeline] ${provider.name} image fallback for ${item.id}: ${error.message}`);
    }
  } else if (IMAGE_PROVIDER !== 'local' && !PIPELINE_OFFLINE) {
    console.warn(`[pipeline] IMAGE_PROVIDER="${IMAGE_PROVIDER}" is not fully configured; using local image fallback`);
  }

  try {
    const poster = await generateLocalPoster(item);
    if (poster) return poster;
  } catch (error) {
    console.error(`[pipeline] source poster fallback for ${item.id}: ${error.message}`);
  }

  return writeLocalEditorialImageSet(item);
}
