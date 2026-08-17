// One-shot runner for The Current column engine.
//
//   node scripts/generate-authored-column.mjs [--dry-run] [--force]
//
// Uses the checked-in latest-news pool as candidates. Requires
// OPENROUTER_API_KEY (the engine skips cleanly without it). --dry-run prints
// the generated column and verification metrics without writing anything.
import { LATEST_NEWS_PATH, NEWS_POOL_PATH, PIPELINE_STATE_PATH } from './lib/constants.mjs';
import { readJsonFile, readPipelineState, writePipelineState } from './lib/state-store.mjs';
import { readArchiveSnapshot } from './lib/archive-store.mjs';
import { generateAuthoredColumn } from './lib/authored-column-engine.mjs';
import { appendAuthoredColumn, readAuthoredColumns } from './lib/authored-column-store.mjs';
import { llmUsageSummary } from './lib/llm-budget.mjs';

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force') || process.env.AUTHORED_COLUMN_FORCE === '1';

async function main() {
  const [state, latest, archive, pool, existingColumns] = await Promise.all([
    readPipelineState(PIPELINE_STATE_PATH),
    readJsonFile(LATEST_NEWS_PATH, []),
    readArchiveSnapshot(),
    readJsonFile(NEWS_POOL_PATH, []),
    readAuthoredColumns(),
  ]);

  const result = await generateAuthoredColumn({
    candidates: latest,
    pool: [...pool, ...latest],
    recentRecords: [...latest, ...archive],
    existingColumns,
    state,
    now: new Date(),
    force,
  });

  if (!result.column) {
    console.log(`[column] no column generated: ${result.skipReason || result.failure}`);
    console.log(`[column] llm usage: ${JSON.stringify(llmUsageSummary())}`);
    process.exitCode = result.failure ? 1 : 0;
    return;
  }

  console.log(`[column] generated: "${result.column.title}"`);
  console.log(`[column] slug: ${result.column.slug}`);
  console.log(`[column] thesis: ${result.column.stance.thesis}`);
  console.log(`[column] metrics: ${JSON.stringify(result.column.authored_quality.metrics)}`);
  console.log(`[column] llm usage: ${JSON.stringify(llmUsageSummary())}`);

  if (dryRun) {
    console.log('\n--- BODY (dry run, not written) ---\n');
    console.log(result.column.expertLensFull.finalArticleBody);
    return;
  }

  await appendAuthoredColumn(result.column);
  await writePipelineState(PIPELINE_STATE_PATH, state);
  console.log('[column] written to src/data/authored-columns.json (rebuild the site to publish)');
}

main().catch((error) => {
  console.error('[column] fatal:', error);
  process.exit(1);
});
