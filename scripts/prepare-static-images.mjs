import { LATEST_NEWS_PATH, ARCHIVE_NEWS_PATH } from './lib/constants.mjs';
import { ensureArticleImage, needsImageRefresh } from './lib/image-generator.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

async function refreshCollection(label, filePath) {
  const items = await readJsonFile(filePath, []);
  if (!Array.isArray(items) || items.length === 0) {
    console.log(`[prepare-static-images] ${label}: no items`);
    return { changed: 0, total: 0 };
  }

  let changed = 0;
  const updated = [];

  for (const item of items) {
    const refresh = await needsImageRefresh(item);
    if (!refresh) {
      updated.push(item);
      continue;
    }

    const generatedImage = await ensureArticleImage(item);
    updated.push({ ...item, generatedImage });
    changed += 1;
    console.log(`[prepare-static-images] ${label}: refreshed ${item.id} -> ${generatedImage}`);
  }

  if (changed > 0) {
    await writeJsonFile(filePath, updated);
  }

  return { changed, total: items.length };
}

async function main() {
  const latest = await refreshCollection('latest', LATEST_NEWS_PATH);
  const archived = await refreshCollection('archive', ARCHIVE_NEWS_PATH);
  console.log(
    `[prepare-static-images] done latest=${latest.changed}/${latest.total} archive=${archived.changed}/${archived.total}`
  );
}

main().catch((error) => {
  console.error('[prepare-static-images] fatal:', error);
  process.exitCode = 1;
});
