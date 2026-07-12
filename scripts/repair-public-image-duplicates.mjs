import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
  SEARCH_INDEX_PATH,
  TAXONOMY_PAGES_PATH,
} from './lib/constants.mjs';
import { ensureCanonicalArticleImageSet } from './lib/article-origin-image-canonicalizer.mjs';
import {
  articleCardImage,
  localArticleImagePath,
  syncArticleImagesById,
  syncTaxonomyArticleImagesById,
  withGeneratedArticleImage,
} from './lib/article-image-surface.mjs';
import { ensureArticleImage } from './lib/image-generator.mjs';
import { canonicalArticleImagePaths } from './lib/image-store.mjs';
import {
  LOCAL_GENERATED_METADATA,
  generatedArticleImageMetadata,
} from './lib/static-image-prep-helpers.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

const VERIFIED_SOURCE_IMAGES = new Map([
  [
    'watch_sig_280ee67ee0e4b1f5',
    'https://media.datacenterdynamics.com/media/images/Dell_Booth.2e16d0ba.fill-1200x630.jpg',
  ],
  [
    'watch_sig_3aafa5f53fed9710',
    'https://img.datacenterfrontier.com/files/base/ebm/datacenterfrontier/image/2026/05/6a0b2b3ddb61dd0202d6db86-fcbolton.png?auto=format,compress&fit=fill&fill=blur&w=1200&h=630',
  ],
]);

function verifiedSourceRepairComplete(item, sourceImage) {
  const paths = canonicalArticleImagePaths(item, { extension: 'webp', legacyExtension: 'webp' });
  return item.sourceImage === sourceImage
    && item.generatedImageProvider === 'source-image'
    && item.generatedImageModel === 'origin-canonical'
    && item.imageStatus === 'source-canonical'
    && item.heroImage === paths.heroImage
    && item.thumbnailImage === paths.thumbnailImage
    && item.ogImage === paths.ogImage
    && item.legacyImage === paths.legacyImage
    && [paths.heroImage, paths.thumbnailImage, paths.ogImage, paths.legacyImage]
      .every((image) => {
        const localPath = localArticleImagePath(image);
        return Boolean(localPath && fs.existsSync(localPath));
      });
}

async function repairVerifiedSourceImages(items = []) {
  let changed = 0;
  const updated = [];

  for (const item of items) {
    const sourceImage = VERIFIED_SOURCE_IMAGES.get(item?.id);
    if (!sourceImage) {
      updated.push(item);
      continue;
    }
    if (verifiedSourceRepairComplete(item, sourceImage)) {
      updated.push(item);
      continue;
    }

    const canonical = await ensureCanonicalArticleImageSet({
      id: item.id,
      title: item.title,
      slug: item.slug,
      sourceImage,
    }, { overwrite: true });
    if (canonical.skipped) {
      throw new Error(`${item.id}: ${canonical.reason || 'source image canonicalization failed'}`);
    }

    updated.push(withGeneratedArticleImage({ ...item, sourceImage }, canonical.paths.heroImage, {
      sourceImage,
      heroImage: canonical.paths.heroImage,
      thumbnailImage: canonical.paths.thumbnailImage,
      ogImage: canonical.paths.ogImage,
      legacyImage: canonical.paths.legacyImage,
      generatedImageProvider: 'source-image',
      generatedImageModel: 'origin-canonical',
      imageStatus: 'source-canonical',
    }));
    changed += 1;
  }

  return { changed, items: updated };
}

function duplicateImageIds(items = []) {
  const byHash = new Map();
  const unique = new Map(items.filter((item) => item?.id).map((item) => [item.id, item]));

  for (const item of unique.values()) {
    const image = item?.publicSignal?.image || item?.public_presentation?.image || articleCardImage(item);
    const localPath = localArticleImagePath(image);
    if (!localPath || !fs.existsSync(localPath)) continue;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
    const matches = byHash.get(hash) || [];
    matches.push(item);
    byHash.set(hash, matches);
  }

  const ids = new Set();
  for (const matches of byHash.values()) {
    if (matches.length < 2) continue;
    const preserve = matches.find((item) => item.generatedImageProvider !== 'local-generated');
    for (const item of matches) {
      if (item.generatedImageProvider === 'local-generated' || item.id !== preserve?.id) {
        ids.add(item.id);
      }
    }
  }
  return ids;
}

async function regenerateDuplicateImages(items = [], ids = new Set()) {
  let changed = 0;
  const updated = [];
  for (const item of items) {
    if (!ids.has(item?.id)) {
      updated.push(item);
      continue;
    }
    const generatedImage = await ensureArticleImage({
      ...item,
      forceImageRefresh: true,
      forcePlaceholderImage: true,
    });
    const next = withGeneratedArticleImage(item, generatedImage, {
      ...LOCAL_GENERATED_METADATA,
      ...generatedArticleImageMetadata(item),
    });
    updated.push(next);
    if (JSON.stringify(next) !== JSON.stringify(item)) changed += 1;
  }
  return { changed, items: updated };
}

export async function repairPublicImageDuplicates() {
  const latestItems = await readJsonFile(LATEST_NEWS_PATH, []);
  const archiveItems = await readJsonFile(ARCHIVE_NEWS_PATH, []);
  const latestSource = await repairVerifiedSourceImages(latestItems);
  const archiveSource = await repairVerifiedSourceImages(archiveItems);
  const duplicateIds = duplicateImageIds([...latestSource.items, ...archiveSource.items]);
  const latest = await regenerateDuplicateImages(latestSource.items, duplicateIds);
  const archive = await regenerateDuplicateImages(archiveSource.items, duplicateIds);
  const canonicalItems = [...latest.items, ...archive.items];

  if (latestSource.changed + latest.changed > 0) await writeJsonFile(LATEST_NEWS_PATH, latest.items);
  if (archiveSource.changed + archive.changed > 0) await writeJsonFile(ARCHIVE_NEWS_PATH, archive.items);

  const searchItems = await readJsonFile(SEARCH_INDEX_PATH, []);
  const search = syncArticleImagesById(searchItems, canonicalItems);
  if (search.changed > 0) await writeJsonFile(SEARCH_INDEX_PATH, search.updated);

  const taxonomyPages = await readJsonFile(TAXONOMY_PAGES_PATH, {});
  const taxonomy = syncTaxonomyArticleImagesById(taxonomyPages, canonicalItems);
  if (taxonomy.changed > 0) await writeJsonFile(TAXONOMY_PAGES_PATH, taxonomy.updated);

  const verifiedSources = canonicalItems.filter((item) => {
    const sourceImage = VERIFIED_SOURCE_IMAGES.get(item?.id);
    return sourceImage && verifiedSourceRepairComplete(item, sourceImage);
  }).length;
  if (verifiedSources !== VERIFIED_SOURCE_IMAGES.size) {
    throw new Error(`Expected ${VERIFIED_SOURCE_IMAGES.size} verified source repairs, found ${verifiedSources}`);
  }

  return {
    sourceRepaired: latestSource.changed + archiveSource.changed,
    duplicatesRegenerated: latest.changed + archive.changed,
    duplicateIds: duplicateIds.size,
    searchSynced: search.changed,
    taxonomySynced: taxonomy.changed,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  repairPublicImageDuplicates()
    .then((result) => console.log(`[repair-public-image-duplicates] ${JSON.stringify(result)}`))
    .catch((error) => {
      console.error(`[repair-public-image-duplicates] ${error.message}`);
      process.exitCode = 1;
    });
}
