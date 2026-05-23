import { buildHomepageFeed, publicHomepageFeedEligible } from './lib/homepage-feed-builder.mjs';
import { ensureArticleImage } from './lib/image-generator.mjs';
import { createImageProvider, describeImageProvider } from './lib/image-providers/index.mjs';
import { ARCHIVE_NEWS_PATH, LATEST_NEWS_PATH, OPENAI_IMAGE_MODEL, SEARCH_INDEX_PATH } from './lib/constants.mjs';
import { isStockDerivedCardImage, stockDerivedImageReason } from './lib/stock-card-image-detector.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ALLOW_LOCAL_PLACEHOLDER = args.has('--allow-local-placeholder');
const TARGET_HOME_ONLY = args.has('--homepage-only');

function canonicalKey(article = {}) {
  const url = String(article.sourceUrl || article.url || article.link || '').trim().toLowerCase();
  if (url) return `url:${url.replace(/[?#].*$/, '')}`;
  const title = String(article.title || article.expertLensFull?.finalHeadline || '').trim().toLowerCase();
  const source = String(article.source || article.source_name || '').trim().toLowerCase();
  return `title:${source}:${title}`;
}

function dedupeByCanonical(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = canonicalKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function imagePromptForArticle(article = {}) {
  const category = article.publicSignal?.category || article.category || 'AI infrastructure';
  const title = article.publicSignal?.title || article.title || 'AI infrastructure briefing';
  const context = article.publicSignal?.deck || article.summary || article.snippet || article.articleText || title;
  return [
    'Use case: productivity-visual',
    'Asset type: Compute Current public article card image, 16:9 editorial hero.',
    `Primary request: Create an original premium editorial image for this AI infrastructure story: ${title}`,
    `Scene/backdrop: abstract but concrete AI infrastructure environment tied to ${category}; data center floor, grid equipment, power systems, cooling loops, cloud capacity dashboards, chips, storage arrays, or capital markets signals only when relevant.`,
    'Style/medium: polished generated editorial illustration with realistic depth, cinematic but restrained, not stock photography.',
    'Composition/framing: wide 16:9, strong central visual subject, enough negative space for card cropping, no people posing for camera.',
    'Lighting/mood: premium business intelligence publication, clean contrast, credible infrastructure atmosphere.',
    'Color palette: restrained graphite, steel, deep green, electric blue, copper accents; avoid generic purple gradients.',
    `Context: ${String(context).slice(0, 900)}`,
    'Text (verbatim): ""',
    'Constraints: no logos, no brand marks, no readable text, no watermarks, no fake UI copy, no stock-photo people, no decorative bokeh.',
  ].join('\n');
}

async function generateReplacement(article, provider) {
  const input = {
    ...article,
    imagePrompt: imagePromptForArticle(article),
    forceAiImage: !ALLOW_LOCAL_PLACEHOLDER,
    forceImageRefresh: true,
    forcePlaceholderImage: ALLOW_LOCAL_PLACEHOLDER,
  };
  const generatedImage = await ensureArticleImage(input);
  return {
    generatedImage,
    generatedImageProvider: ALLOW_LOCAL_PLACEHOLDER ? 'local-placeholder' : provider.name,
    generatedImageModel: ALLOW_LOCAL_PLACEHOLDER ? 'local-svg' : OPENAI_IMAGE_MODEL,
    stockImageReplacedAt: new Date().toISOString(),
  };
}

function patchCollection(items = [], replacementsByKey = new Map()) {
  let changed = 0;
  const updated = items.map((item) => {
    const replacement = replacementsByKey.get(canonicalKey(item));
    if (!replacement) return item;
    changed += 1;
    return {
      ...item,
      generatedImage: replacement.generatedImage,
      generatedImageProvider: replacement.generatedImageProvider,
      generatedImageModel: replacement.generatedImageModel,
      stockImageReplacedAt: replacement.stockImageReplacedAt,
    };
  });
  return { changed, updated };
}

function syncCollectionImages(items = [], sourceByKey = new Map()) {
  let changed = 0;
  const updated = items.map((item) => {
    const source = sourceByKey.get(canonicalKey(item));
    if (!source?.generatedImage) return item;

    const next = {
      ...item,
      generatedImage: source.generatedImage,
      generatedImageProvider: source.generatedImageProvider,
      generatedImageModel: source.generatedImageModel,
      stockImageReplacedAt: source.stockImageReplacedAt,
    };

    if (item.publicSignal?.image) {
      next.publicSignal = {
        ...item.publicSignal,
        image: source.generatedImage,
      };
    }

    if (
      next.generatedImage !== item.generatedImage ||
      next.generatedImageProvider !== item.generatedImageProvider ||
      next.generatedImageModel !== item.generatedImageModel ||
      next.stockImageReplacedAt !== item.stockImageReplacedAt ||
      next.publicSignal?.image !== item.publicSignal?.image
    ) {
      changed += 1;
      return next;
    }

    return item;
  });
  return { changed, updated };
}

async function main() {
  const [latest, archived, searchIndex] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
    readJsonFile(SEARCH_INDEX_PATH, []),
  ]);
  const all = [...latest, ...archived];
  const sourceItems = TARGET_HOME_ONLY
    ? buildHomepageFeed(all, { limit: 50, minimumVisible: 30 }).items
    : all.filter(publicHomepageFeedEligible);
  const targets = dedupeByCanonical(sourceItems.filter(isStockDerivedCardImage));
  const provider = createImageProvider();
  const providerPlan = describeImageProvider();

  console.log(
    `[stock-card-images] targets=${targets.length} provider=${providerPlan.active} configured=${providerPlan.configured} model=${OPENAI_IMAGE_MODEL}`
  );

  for (const target of targets) {
    console.log(`[stock-card-images] target ${target.id}: ${stockDerivedImageReason(target)}`);
  }

  if (DRY_RUN) {
    return;
  }

  if (!provider && !ALLOW_LOCAL_PLACEHOLDER) {
    throw new Error(
      'No image provider is configured. Set CHATGPT_IMAGE_OAUTH_ENDPOINT/CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN or IMAGE_PROVIDER=openai-api with OPENAI_API_KEY, or rerun with --allow-local-placeholder.'
    );
  }

  const replacementsByKey = new Map();
  for (const target of targets) {
    const replacement = await generateReplacement(target, provider);
    replacementsByKey.set(canonicalKey(target), replacement);
    console.log(`[stock-card-images] replaced ${target.id} -> ${replacement.generatedImage}`);
  }

  const latestPatch = patchCollection(latest, replacementsByKey);
  const archivePatch = patchCollection(archived, replacementsByKey);
  const sourceByKey = new Map(
    [...latestPatch.updated, ...archivePatch.updated]
      .filter((item) => item?.generatedImage)
      .map((item) => [canonicalKey(item), item])
  );
  const searchPatch = syncCollectionImages(searchIndex, sourceByKey);

  await Promise.all([
    latestPatch.changed ? writeJsonFile(LATEST_NEWS_PATH, latestPatch.updated) : Promise.resolve(),
    archivePatch.changed ? writeJsonFile(ARCHIVE_NEWS_PATH, archivePatch.updated) : Promise.resolve(),
    searchPatch.changed ? writeJsonFile(SEARCH_INDEX_PATH, searchPatch.updated) : Promise.resolve(),
  ]);

  console.log(
    `[stock-card-images] updated latest=${latestPatch.changed}/${latest.length} archived=${archivePatch.changed}/${archived.length} search=${searchPatch.changed}/${searchIndex.length}`
  );
}

main().catch((error) => {
  console.error(`[stock-card-images] fatal: ${error.message}`);
  process.exitCode = 1;
});
