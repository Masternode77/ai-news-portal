import {
  LATEST_NEWS_PATH,
  ARCHIVE_NEWS_PATH,
  SEARCH_INDEX_PATH,
  TAXONOMY_PAGES_PATH,
} from './lib/constants.mjs';
import { ensureArticleImage, needsImageRefresh } from './lib/image-generator.mjs';
import {
  syncArticleImagesById,
  syncTaxonomyArticleImagesById,
  withGeneratedArticleImage,
} from './lib/article-image-surface.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

const LOCAL_PLACEHOLDER_METADATA = {
  generatedImageProvider: 'local-placeholder',
  generatedImageModel: 'local-svg',
};

export async function refreshCollection(label, filePath) {
  const items = await readJsonFile(filePath, []);
  if (!Array.isArray(items) || items.length === 0) {
    console.log(`[prepare-static-images] ${label}: no items`);
    return { changed: 0, total: 0, items: [] };
  }

  let changed = 0;
  const updated = [];

  for (const item of items) {
    const refresh = await needsImageRefresh(item);
    if (!refresh) {
      updated.push(item);
      continue;
    }

    try {
      const generatedImage = await ensureArticleImage({ ...item, forcePlaceholderImage: true });
      updated.push(withGeneratedArticleImage(item, generatedImage, LOCAL_PLACEHOLDER_METADATA));
      changed += 1;
      console.log(`[prepare-static-images] ${label}: refreshed ${item.id} -> ${generatedImage}`);
    } catch (error) {
      console.warn(`[prepare-static-images] ${label}: skipped ${item.id} -> ${error.message}`);
      updated.push(item);
    }
  }

  if (changed > 0) {
    await writeJsonFile(filePath, updated);
  }

  return { changed, total: items.length, items: updated };
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
  const latest = await refreshCollection('latest', LATEST_NEWS_PATH);
  const archived = await refreshCollection('archive', ARCHIVE_NEWS_PATH);
  const canonicalItems = [...latest.items, ...archived.items];
  const search = await syncCollectionImages('search', SEARCH_INDEX_PATH, canonicalItems);
  const taxonomy = await syncTaxonomyImages(canonicalItems);
  console.log(
    `[prepare-static-images] done latest=${latest.changed}/${latest.total} archive=${archived.changed}/${archived.total} search=${search.changed}/${search.total} taxonomy=${taxonomy.changed}`
  );
}

main().catch((error) => {
  console.error('[prepare-static-images] fatal:', error);
  process.exitCode = 1;
});
