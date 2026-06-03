import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
  PIPELINE_OFFLINE,
} from './lib/constants.mjs';
import { generateArticleImageSet, metadataPatchFromImageSet } from './lib/image2-provider.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(value, next);
      index += 1;
    } else {
      flags.add(value);
    }
  }
  return { args, flags };
}

function findArticle(collections, id) {
  for (const collection of collections) {
    const index = collection.items.findIndex((item) => item?.id === id);
    if (index !== -1) return { collection, index, article: collection.items[index] };
  }
  return null;
}

function patchArticle(collection, index, patch) {
  const next = [...collection.items];
  next[index] = {
    ...next[index],
    ...patch,
  };
  return next;
}

async function main() {
  const { args, flags } = parseArgs();
  const id = args.get('--id');
  const dryRun = flags.has('--dry-run');
  const jsonOnly = flags.has('--json') || dryRun;

  if (!id) {
    console.error('Usage: node scripts/generate-article-image.mjs --id <article-id> [--dry-run]');
    process.exitCode = 1;
    return;
  }

  const latest = await readJsonFile(LATEST_NEWS_PATH, []);
  const archived = await readJsonFile(ARCHIVE_NEWS_PATH, []);
  const collections = [
    { label: 'latest', path: LATEST_NEWS_PATH, items: latest },
    { label: 'archive', path: ARCHIVE_NEWS_PATH, items: archived },
  ];
  const found = findArticle(collections, id);

  if (!found) {
    console.error(`Article not found: ${id}`);
    process.exitCode = 1;
    return;
  }

  const result = await generateArticleImageSet(found.article, {
    offline: PIPELINE_OFFLINE,
  });
  const patch = metadataPatchFromImageSet(result);
  const payload = {
    articleId: id,
    collection: found.collection.label,
    dryRun,
    metadata: patch,
    result,
  };

  if (!dryRun) {
    const updated = patchArticle(found.collection, found.index, patch);
    await writeJsonFile(found.collection.path, updated);
    payload.updated = true;
  } else {
    payload.updated = false;
  }

  if (jsonOnly) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`[generate-article-image] ${id} -> ${patch.heroImage} (${patch.imageStatus})`);
  }
}

main().catch((error) => {
  console.error(`[generate-article-image] fatal: ${error.message}`);
  process.exitCode = 1;
});
