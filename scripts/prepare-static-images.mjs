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
  syncArticleImagesById,
  syncTaxonomyArticleImagesById,
  withGeneratedArticleImage,
} from './lib/article-image-surface.mjs';
import { ensureCanonicalArticleImageSet } from './lib/article-origin-image-canonicalizer.mjs';
import {
  LOCAL_GENERATED_METADATA,
  ensurePublicFallbackImages,
  generatedArticleImageMetadata,
  imageInputWithoutDefaultLocalImage,
  imageRecordLooksDefault,
} from './lib/static-image-prep-helpers.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

export { ensureCanonicalArticleImageSet } from './lib/article-origin-image-canonicalizer.mjs';
export { ensurePublicFallbackImages } from './lib/static-image-prep-helpers.mjs';

function shouldGenerateImage2First(item = {}) {
  return Boolean(item?.forceAiImage || item?.forceImageRefresh);
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
        if (metadata.generatedImage && imageSet.status === 'generated') {
          nextItem = withGeneratedArticleImage(item, metadata.generatedImage, metadata);
          changed += 1;
          console.log(`[prepare-static-images] ${label}: image2 refreshed ${item.id} -> ${metadata.generatedImage}`);
          updated.push(nextItem);
          continue;
        }
        console.warn(`[prepare-static-images] ${label}: image2 unavailable ${item.id}; trying source image`);
      } catch (error) {
        console.warn(`[prepare-static-images] ${label}: image2 skipped ${item.id} -> ${error.message}`);
      }
    }

    try {
      const canonicalInput = imageInputWithoutDefaultLocalImage(nextItem);
      const canonical = await ensureCanonicalArticleImageSet(canonicalInput, {
        overwrite: imageRecordLooksDefault(nextItem),
      });
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
      nextItem = withGeneratedArticleImage(item, generatedImage, {
        ...LOCAL_GENERATED_METADATA,
        ...generatedArticleImageMetadata(item),
      });
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
