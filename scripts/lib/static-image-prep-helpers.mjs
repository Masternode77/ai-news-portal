import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PUBLIC_IMAGE_FALLBACK_SLUGS,
  fallbackCategoryImagePath,
} from './article-image-surface.mjs';
import { canonicalArticleImagePaths } from './image-store.mjs';

export const LOCAL_GENERATED_METADATA = {
  generatedImageProvider: 'local-generated',
  generatedImageModel: 'deterministic-editorial-raster-v2',
  imageStatus: 'generated',
};

const DEFAULT_IMAGE_RE = /\b(?:local-placeholder|local-svg|category-fallback|fallback|placeholder)\b/i;

function fallbackLabel(slug = 'ai-infrastructure') {
  const labels = {
    'power-grid': 'Power & Grid',
    'data-centers': 'Data Centers',
    'cloud-capacity': 'Cloud Capacity',
    semiconductors: 'Semiconductors',
    cooling: 'Cooling',
    'capital-markets': 'Capital Markets',
    regulation: 'Policy & Siting',
    'supply-chain': 'Supply Chain',
    'ai-infrastructure': 'AI Infrastructure',
  };
  return labels[slug] || 'AI Infrastructure';
}

function fallbackAccent(slug = 'ai-infrastructure') {
  const accents = {
    'power-grid': ['#275f68', '#e1b455'],
    'data-centers': ['#364f6b', '#70a6c7'],
    'cloud-capacity': ['#315b78', '#86c7a4'],
    semiconductors: ['#4d566f', '#d5a35f'],
    cooling: ['#28636b', '#7fd3cf'],
    'capital-markets': ['#5f4d3e', '#d2b15f'],
    regulation: ['#4f5c69', '#b9c4d0'],
    'supply-chain': ['#5a6140', '#c1c96a'],
    'ai-infrastructure': ['#26343d', '#aebd7a'],
  };
  return accents[slug] || accents['ai-infrastructure'];
}

function escapeXml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fallbackSvg(slug = 'ai-infrastructure') {
  const [one, two] = fallbackAccent(slug);
  const label = fallbackLabel(slug);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Compute Current ${escapeXml(label)} editorial fallback image">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${one}"/>
      <stop offset="0.52" stop-color="#101820"/>
      <stop offset="1" stop-color="#090c10"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="20"/></filter>
  </defs>
  <rect width="1200" height="630" rx="28" fill="url(#bg)"/>
  <circle cx="220" cy="112" r="172" fill="${two}" opacity="0.2" filter="url(#soft)"/>
  <circle cx="1010" cy="116" r="138" fill="#f2f5ed" opacity="0.1" filter="url(#soft)"/>
  <g stroke="rgba(255,255,255,0.1)" stroke-width="1">
    <path d="M88 460H1112"/>
    <path d="M88 374H1112"/>
    <path d="M236 82V548"/>
    <path d="M564 82V548"/>
    <path d="M892 82V548"/>
  </g>
  <path d="M104 446C236 366 348 332 456 338C590 346 674 420 792 384C894 352 982 258 1096 176" fill="none" stroke="#f4f7f0" stroke-opacity="0.54" stroke-width="5"/>
  <rect x="70" y="70" width="1060" height="490" rx="24" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.14)"/>
  <text x="104" y="162" fill="#dfe9f7" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="0.08em">${escapeXml(label)}</text>
  <text x="104" y="274" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="70" font-weight="850">Compute Current</text>
  <text x="104" y="330" fill="#cbd8e8" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="650">AI infrastructure intelligence</text>
  <text x="104" y="506" fill="#d6dfef" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="720">Fallback editorial image</text>
</svg>`;
}

async function fileExists(filePath = '') {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function imageRecordLooksDefault(item = {}) {
  const providerText = [
    item.generatedImageProvider,
    item.imageProvider,
    item.image_source_provider,
    item.generatedImageModel,
    item.imageModel,
    item.imageStatus,
    item.image_status,
  ].filter(Boolean).join(' ');
  const generatedImage = String(item.generatedImage || item.image || '');
  return DEFAULT_IMAGE_RE.test(providerText)
    || generatedImage.startsWith('/generated/fallbacks/')
    || /\.svg(?:$|[?#])/i.test(generatedImage);
}

export function imageInputWithoutDefaultLocalImage(item = {}) {
  if (!imageRecordLooksDefault(item)) return item;
  const nextItem = { ...item };
  for (const field of ['generatedImage', 'heroImage', 'thumbnailImage', 'ogImage', 'legacyImage']) {
    delete nextItem[field];
  }
  return nextItem;
}

export function generatedArticleImageMetadata(item = {}) {
  const paths = canonicalArticleImagePaths(item, { extension: 'webp', legacyExtension: 'webp' });
  return {
    heroImage: paths.heroImage,
    thumbnailImage: paths.thumbnailImage,
    ogImage: paths.ogImage,
    legacyImage: paths.legacyImage,
  };
}

export async function ensurePublicFallbackImages(options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const ensured = [];
  const created = [];
  const missing = [];

  for (const slug of PUBLIC_IMAGE_FALLBACK_SLUGS) {
    const publicPath = fallbackCategoryImagePath({ category: slug });
    const filePath = path.join(publicDir, publicPath.replace(/^\//, ''));
    try {
      const exists = await fileExists(filePath);
      if (!exists || options.overwrite === true) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, fallbackSvg(slug), 'utf8');
        created.push(publicPath);
      }
      ensured.push(publicPath);
    } catch {
      missing.push(publicPath);
    }
  }

  return { ensured, created, missing };
}
