import {
  LATEST_NEWS_PATH,
  NEWS_POOL_PATH,
  PIPELINE_STATE_PATH,
} from './lib/constants.mjs';
import { enrichContent } from './lib/content.mjs';
import { planForToday, pickItemsForRun, updatePlanAfterRun } from './lib/curate.mjs';
import { fetchNewsPool } from './lib/fetch-feeds.mjs';
import { ensureArticleImage } from './lib/image-generator.mjs';
import {
  readJsonFile,
  readPipelineState,
  writeJsonFile,
  writePipelineState,
} from './lib/state-store.mjs';

async function main() {
  const now = new Date();
  console.log(`[pipeline] run started at ${now.toISOString()}`);

  const [state, existingLatest] = await Promise.all([
    readPipelineState(PIPELINE_STATE_PATH),
    readJsonFile(LATEST_NEWS_PATH, []),
  ]);

  const pool = await fetchNewsPool();
  await writeJsonFile(NEWS_POOL_PATH, pool);

  if (!pool.length) {
    console.log('[pipeline] no feed items available; exiting without changes');
    return;
  }

  const itemById = new Map(pool.map((item) => [item.id, item]));
  const { key: todayKey, plan } = planForToday(pool, state, now);
  const { slot, picked } = pickItemsForRun(plan, itemById, now);

  if (!picked.length) {
    console.log(`[pipeline] no publishable items for slot ${slot} on ${todayKey}`);

    state.dayPlans[todayKey] = {
      ...plan,
      slotPublications: {
        ...(plan.slotPublications || {}),
        [slot]: true,
      },
    };

    state.lastRunAt = now.toISOString();
    state.runHistory.push({ at: now.toISOString(), day: todayKey, slot, publishedCount: 0 });
    state.runHistory = state.runHistory.slice(-60);
    await writePipelineState(PIPELINE_STATE_PATH, state);
    return;
  }

  const enriched = [];
  for (const item of picked) {
    const article = enrichContent(item);
    article.image = await ensureArticleImage(article);
    article.generatedImage = article.image;
    enriched.push(article);
  }

  const published = [...enriched, ...existingLatest].slice(0, 60);

  await writeJsonFile(LATEST_NEWS_PATH, published);

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

  console.log(`[pipeline] completed. published ${enriched.length} articles for slot ${slot} (${todayKey}).`);
}

main().catch((error) => {
  console.error('[pipeline] fatal error:', error);
  process.exitCode = 1;
});
