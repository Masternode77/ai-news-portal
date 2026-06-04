import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  LATEST_NEWS_PATH,
  ARCHIVE_NEWS_PATH,
  SEARCH_INDEX_PATH,
  TAXONOMY_PAGES_PATH,
} from './lib/constants.mjs';
import { ensureArticleImage, needsImageRefresh } from './lib/image-generator.mjs';
import { generateArticleImageSet, metadataPatchFromImageSet } from './lib/image2-provider.mjs';
import {
  PUBLIC_IMAGE_FALLBACK_SLUGS,
  fallbackCategoryImagePath,
  syncArticleImagesById,
  syncTaxonomyArticleImagesById,
  withGeneratedArticleImage,
} from './lib/article-image-surface.mjs';
import { ensureCanonicalArticleImageSet } from './lib/article-origin-image-canonicalizer.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

export { ensureCanonicalArticleImageSet } from './lib/article-origin-image-canonicalizer.mjs';

const LOCAL_PLACEHOLDER_METADATA = {
  generatedImageProvider: 'local-placeholder',
  generatedImageModel: 'local-svg',
};

function shouldGenerateImage2First(item = {}) {
  return Boolean(item?.forceAiImage || item?.forceImageRefresh);
}

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

export async function refreshCollection(label, filePath) {
  const items = await readJsonFile(filePath, []);
  if (!Array.isArray(items) || items.length === 0) {
    console.log(`[prepare-static-images] ${label}: no items`);
    return { changed: 0, canonicalChanged: 0, total: 0, items: [] };
  }

  let changed = 0;
  let canonicalChanged = 0;
  const updated = [];

  for (const item of items) {
    let nextItem = item;
    const refresh = await needsImageRefresh(item);
    if (!refresh) {
      try {
        const canonical = await ensureCanonicalArticleImageSet(nextItem);
        canonicalChanged += canonical.changed;
      } catch (error) {
        console.warn(`[prepare-static-images] ${label}: canonical skipped ${item.id} -> ${error.message}`);
      }
      updated.push(nextItem);
      continue;
    }

    if (shouldGenerateImage2First(item)) {
      try {
        const imageSet = await generateArticleImageSet(nextItem);
        const metadata = metadataPatchFromImageSet(imageSet);
        if (metadata.generatedImage) {
          nextItem = withGeneratedArticleImage(item, metadata.generatedImage, metadata);
          changed += 1;
          console.log(`[prepare-static-images] ${label}: image2 refreshed ${item.id} -> ${metadata.generatedImage}`);
          updated.push(nextItem);
          continue;
        }
      } catch (error) {
        console.warn(`[prepare-static-images] ${label}: image2 skipped ${item.id} -> ${error.message}`);
      }
    }

    try {
      const canonical = await ensureCanonicalArticleImageSet(nextItem);
      if (!canonical.skipped) {
        nextItem = withGeneratedArticleImage(item, canonical.paths.heroImage, {
          heroImage: canonical.paths.heroImage,
          thumbnailImage: canonical.paths.thumbnailImage,
          ogImage: canonical.paths.ogImage,
          legacyImage: canonical.paths.legacyImage,
          generatedImageProvider: 'source-image',
          generatedImageModel: 'origin-canonical',
          imageStatus: 'source-canonical',
        });
        changed += 1;
        canonicalChanged += canonical.changed;
        console.log(`[prepare-static-images] ${label}: canonicalized source ${item.id} -> ${canonical.paths.heroImage}`);
        updated.push(nextItem);
        continue;
      }
    } catch (error) {
      console.warn(`[prepare-static-images] ${label}: source canonical skipped ${item.id} -> ${error.message}`);
    }

    try {
      const generatedImage = await ensureArticleImage({ ...item, forcePlaceholderImage: true });
      nextItem = withGeneratedArticleImage(item, generatedImage, LOCAL_PLACEHOLDER_METADATA);
      changed += 1;
      console.log(`[prepare-static-images] ${label}: refreshed ${item.id} -> ${generatedImage}`);
    } catch (error) {
      console.warn(`[prepare-static-images] ${label}: skipped ${item.id} -> ${error.message}`);
    }

    try {
      const canonical = await ensureCanonicalArticleImageSet(nextItem);
      canonicalChanged += canonical.changed;
    } catch (error) {
      console.warn(`[prepare-static-images] ${label}: canonical skipped ${item.id} -> ${error.message}`);
    }
    updated.push(nextItem);
  }

  if (changed > 0) {
    await writeJsonFile(filePath, updated);
  }

  return { changed, canonicalChanged, total: items.length, items: updated };
}

async function syncCollectionImages(label, filePath, canonicalItems) {
  const items = await readJsonFile(filePath, []);
  if (!Array.isArray(items) || items.length === 0) {
    return { changed: 0, total: 0 };
  }
  const result = syncArticleImagesById(items, canonicalItems);
  if (result.changed > 0) {
    await writeJsonFile(filePath, result.updated);
  }
  console.log(`[prepare-static-images] ${label}: synced ${result.changed}/${items.length}`);
  return { changed: result.changed, total: items.length };
}

async function syncTaxonomyImages(canonicalItems) {
  const taxonomy = await readJsonFile(TAXONOMY_PAGES_PATH, null);
  if (!taxonomy || typeof taxonomy !== 'object') {
    return { changed: 0, total: 0 };
  }
  const result = syncTaxonomyArticleImagesById(taxonomy, canonicalItems);
  if (result.changed > 0) {
    await writeJsonFile(TAXONOMY_PAGES_PATH, result.updated);
  }
  console.log(`[prepare-static-images] taxonomy: synced ${result.changed}`);
  return { changed: result.changed, total: result.changed };
}

async function main() {
  const fallbacks = await ensurePublicFallbackImages();
  const latest = await refreshCollection('latest', LATEST_NEWS_PATH);
  const archived = await refreshCollection('archive', ARCHIVE_NEWS_PATH);
  const canonicalItems = [...latest.items, ...archived.items];
  const search = await syncCollectionImages('search', SEARCH_INDEX_PATH, canonicalItems);
  const taxonomy = await syncTaxonomyImages(canonicalItems);
  console.log(
    `[prepare-static-images] done fallbacks=${fallbacks.created.length}/${fallbacks.ensured.length} latest=${latest.changed}/${latest.total} latestCanonical=${latest.canonicalChanged} archive=${archived.changed}/${archived.total} archiveCanonical=${archived.canonicalChanged} search=${search.changed}/${search.total} taxonomy=${taxonomy.changed}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[prepare-static-images] fatal:', error);
    process.exitCode = 1;
  });
}
