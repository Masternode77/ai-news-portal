import {
  LATEST_NEWS_PATH,
  NEWS_POOL_PATH,
  PIPELINE_STATE_PATH,
  PIPELINE_USE_EXISTING_POOL,
  LATEST_NEWS_LIMIT,
} from './lib/constants.mjs';
import { readArchiveSnapshot, syncArchiveArtifacts } from './lib/archive-store.mjs';
import { enrichContent } from './lib/content.mjs';
import { planForToday, pickItemsForRun, updatePlanAfterRun } from './lib/curate.mjs';
import { attachExpertLens, hydrateExpertLens, mergeArticleRecords } from './lib/expert-lens.mjs';
import { fetchNewsPool } from './lib/fetch-feeds.mjs';
import { ensureArticleImage, needsImageRefresh } from './lib/image-generator.mjs';
import {
  readJsonFile,
  readPipelineState,
  sleep,
  writeJsonFile,
  writePipelineState,
} from './lib/state-store.mjs';
import { stableArticleId, truncate } from './lib/normalize.mjs';

async function withSingleRetry(label, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[pipeline] ${label} failed; retrying once in 60s -> ${error.message}`);
    await sleep(60_000);
    return fn();
  }
}

async function withTimeout(label, fn, timeoutMs = 90_000) {
  let timeoutId;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function legacyPoolFromLatest(existingLatest = []) {
  return existingLatest
    .filter((item) => item?.url && item?.title)
    .map((item) => normalizeExistingArticle(item));
}

function normalizeExistingArticle(item) {
  return hydrateExpertLens({
    ...item,
    id: item.id || stableArticleId(item.url, item.title),
    source: item.source || 'Legacy Source',
    snippet: item.snippet || truncate(item.summary || item.title, 220),
    contentText: item.contentText || truncate(item.articleText || item.summary || item.snippet || item.title, 800),
    publishedAt: item.publishedAt || new Date().toISOString(),
    sourceImage: item.sourceImage || item.image || null,
    region: item.region || 'Global',
    language: item.language || 'en',
    defaultCategory: item.defaultCategory || item.category || null,
    sourceUrl: item.sourceUrl || item.url,
  });
}

function dedupeById(items) {
  const merged = new Map();
  const orderedIds = [];

  for (const item of items) {
    const id = item?.id;
    if (!id) continue;
    if (!merged.has(id)) {
      orderedIds.push(id);
      merged.set(id, normalizeExistingArticle(item));
      continue;
    }
    merged.set(id, mergeArticleRecords(merged.get(id), item));
  }

  return orderedIds.map((id) => merged.get(id));
}

async function loadPoolWithFallback(existingLatest) {
  if (PIPELINE_USE_EXISTING_POOL) {
    const existingPool = await readJsonFile(NEWS_POOL_PATH, []);
    return existingPool.length ? existingPool : legacyPoolFromLatest(existingLatest);
  }

  try {
    const pool = await withSingleRetry('fetch pool', () => fetchNewsPool());
    if (pool.length) {
      await writeJsonFile(NEWS_POOL_PATH, pool);
      return pool;
    }
  } catch (error) {
    console.warn(`[pipeline] live pool unavailable, falling back to existing pool -> ${error.message}`);
  }

  const fallbackPool = await readJsonFile(NEWS_POOL_PATH, []);
  return fallbackPool.length ? fallbackPool : legacyPoolFromLatest(existingLatest);
}

async function backfillLocalImages(articles) {
  return Promise.all(
    articles.map(async (article) => {
      if (!(await needsImageRefresh(article))) {
        return article;
      }
      const generatedImage = await withTimeout(
        `image refresh ${article.id}`,
        () => ensureArticleImage(article),
        45_000
      ).catch((error) => {
        console.warn(`[pipeline] image refresh skipped for ${article.id} -> ${error.message}`);
        return article.generatedImage || null;
      });
      return { ...article, generatedImage };
    })
  );
}

async function attachExpertLensToVisibleWindow(articles, focusArticleIds = []) {
  const visible = articles.slice(0, LATEST_NEWS_LIMIT);
  const overflow = articles.slice(LATEST_NEWS_LIMIT);
  const focusIds = new Set(focusArticleIds);

  console.log(
    `[pipeline] expert-lens scope: visible=${visible.length}, overflow=${overflow.length}, focus=${focusIds.size}`
  );

  const hydratedVisible = visible.map((article) => hydrateExpertLens(article));
  const focusTargets = hydratedVisible.filter((article) => focusIds.has(article.id));
  const unchangedVisible = hydratedVisible.filter((article) => !focusIds.has(article.id));

  let enrichedFocus = focusTargets;
  if (focusTargets.length) {
    enrichedFocus = await withTimeout(
      'attach expert lens to focused articles',
      () => attachExpertLens(focusTargets),
      90_000
    ).catch((error) => {
      console.warn(`[pipeline] expert lens fallback -> ${error.message}`);
      return focusTargets.map((article) => hydrateExpertLens(article));
    });
  }

  const enrichedById = new Map(enrichedFocus.map((article) => [article.id, article]));
  const finalVisible = hydratedVisible.map((article) => enrichedById.get(article.id) || article);

  return [...finalVisible, ...overflow.map((article) => hydrateExpertLens(article))];
}

async function enrichPickedArticles(picked) {
  const results = [];

  for (const item of picked) {
    console.log(`[pipeline] enriching article ${item.id} :: ${item.title}`);
    const article = await withTimeout(
      `enrich article ${item.id}`,
      () => withSingleRetry(`enrich article ${item.id}`, () => enrichContent(item)),
      75_000
    );

    const generatedImage = await withTimeout(
      `generate image ${item.id}`,
      () => withSingleRetry(`generate image ${item.id}`, () => ensureArticleImage(article)),
      45_000
    ).catch((error) => {
      console.warn(`[pipeline] image generation degraded for ${item.id} -> ${error.message}`);
      return article.generatedImage || null;
    });

    results.push({ ...article, generatedImage });
  }

  return results;
}

async function main() {
  const now = new Date();
  console.log(`[pipeline] run started at ${now.toISOString()}`);

  const [state, existingLatest, existingArchive] = await Promise.all([
    readPipelineState(PIPELINE_STATE_PATH),
    readJsonFile(LATEST_NEWS_PATH, []),
    readArchiveSnapshot(),
  ]);

  const pool = await loadPoolWithFallback(existingLatest);
  console.log(`[pipeline] pool loaded: ${pool.length} items`);

  if (!pool.length) {
    console.log('[pipeline] no feed items available; exiting without changes');
    return;
  }

  const { key: todayKey, plan } = await planForToday(pool, state, now);
  const { slot, picked } = pickItemsForRun(plan, now);
  console.log(`[pipeline] plan selected for ${todayKey} slot=${slot} picked=${picked.length}`);

  if (!picked.length) {
    console.log(`[pipeline] no publishable items for slot ${slot} on ${todayKey}`);
    const normalizedExisting = dedupeById((existingLatest || []).map((item) => normalizeExistingArticle(item)));
    const imageBackfilled = await backfillLocalImages(normalizedExisting);
    const withExpertLens = await attachExpertLensToVisibleWindow(imageBackfilled, []);
    const { latest, supabaseStatus } = await syncArchiveArtifacts(withExpertLens, existingArchive);
    await writeJsonFile(LATEST_NEWS_PATH, latest);

    state.dayPlans[todayKey] = {
      ...plan,
      slotPublications: {
        ...(plan.slotPublications || {}),
        [slot]: true,
      },
    };
    state.lastRunAt = now.toISOString();
    state.runHistory.push({
      at: now.toISOString(),
      day: todayKey,
      slot,
      publishedCount: 0,
    });
    state.runHistory = state.runHistory.slice(-120);
    await writePipelineState(PIPELINE_STATE_PATH, state);
    console.log(`[pipeline] normalization-only pass complete. archive push: ${JSON.stringify(supabaseStatus)}`);
    return;
  }

  const enriched = await enrichPickedArticles(picked);
  console.log(`[pipeline] article enrichment complete: ${enriched.length} items`);

  const normalizedExisting = dedupeById((existingLatest || []).map((item) => normalizeExistingArticle(item)));
  const dedupedExisting = normalizedExisting.filter(
    (item) => !enriched.some((fresh) => fresh.id === item.id)
  );

  const merged = dedupeById([...enriched, ...dedupedExisting, ...(existingArchive || [])]).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  console.log(`[pipeline] merged article set: ${merged.length}`);

  const imageBackfilled = await backfillLocalImages(merged);
  const withExpertLens = await attachExpertLensToVisibleWindow(
    imageBackfilled,
    enriched.map((article) => article.id)
  );
  const { latest, supabaseStatus } = await syncArchiveArtifacts(withExpertLens, existingArchive);

  await writeJsonFile(LATEST_NEWS_PATH, latest);

  const updatedPlan = updatePlanAfterRun(plan, enriched, slot);
  state.dayPlans[todayKey] = updatedPlan;
  state.publishedIds = [...new Set([...(state.publishedIds || []), ...enriched.map((x) => x.id)])].slice(-1000);
  state.lastRunAt = now.toISOString();
  state.runHistory.push({
    at: now.toISOString(),
    day: todayKey,
    slot,
    publishedCount: enriched.length,
    publishedIds: enriched.map((x) => x.id),
  });
  state.runHistory = state.runHistory.slice(-120);

  await writePipelineState(PIPELINE_STATE_PATH, state);

  console.log(
    `[pipeline] completed. published ${enriched.length} articles for slot ${slot} (${todayKey}). archive push: ${JSON.stringify(supabaseStatus)}`
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[pipeline] fatal error:', error);
    process.exit(1);
  });
