import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCurationFloor, pickItemsForRun, rollingCandidates, surfacedProcessedIds, updatePlanAfterRun } from '../scripts/lib/curate.mjs';

const NOW = new Date('2026-10-04T12:00:00Z');

function candidate(id, hoursOld, infra = 0.6, ai = 0, extra = {}) {
  return {
    id,
    source: `Source ${id}`,
    title: `AI data center capacity story ${id}`,
    snippet: `Grid and GPU capacity update ${id}`,
    publishedAt: new Date(NOW.getTime() - hoursOld * 3_600_000).toISOString(),
    infrastructure_relevance_score: infra,
    ai_topic_score: ai,
    infrastructure_relevance_tier: infra >= 0.55 ? 'signal_card' : 'archive_only',
    score: 50,
    ...extra,
  };
}

const ids = (count, prefix = 'done') => Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

test('a slot that already ran no longer blocks the next run, but each run and day are capped', () => {
  const curatedItems = Array.from({ length: 12 }, (_, index) => candidate(`c${index}`, index));
  const plan = { curatedItems, publishedIds: ['c0'], visibleIds: ['c0'], slotPublications: { 0: true, 1: true, 2: true } };
  const { picked } = pickItemsForRun(plan, NOW, { force: false });
  assert.deepEqual(picked.map((item) => item.id), ['c1', 'c2', 'c3']);

  const nearlyFull = { ...plan, publishedIds: ids(8), visibleIds: ids(8) };
  assert.equal(pickItemsForRun(nearlyFull, NOW, { force: false }).picked.length, 1, 'the ninth published item of the day is the last one');
  const full = { ...plan, publishedIds: ids(9), visibleIds: ids(9) };
  assert.equal(pickItemsForRun(full, NOW, { force: false }).picked.length, 0);
  assert.equal(pickItemsForRun(full, NOW, { force: true }).picked.length, 3, 'an operator-forced run lifts the daily cap');
});

test('archive-only outcomes do not close the day, but the processing limit does', () => {
  const curatedItems = Array.from({ length: 30 }, (_, index) => candidate(`c${index}`, index));
  // 2026-10-05 KST: three runs processed nine picks and filed all nine as archive-only.
  const archivedMorning = { curatedItems, publishedIds: ids(9, 'arch'), visibleIds: [] };
  assert.equal(pickItemsForRun(archivedMorning, NOW, { force: false }).picked.length, 3);
  const legacyPlan = { curatedItems, publishedIds: ids(9, 'arch') };
  assert.equal(pickItemsForRun(legacyPlan, NOW, { force: false }).picked.length, 3, 'a plan written before visibleIds existed is not treated as full');
  const nearLimit = { curatedItems, publishedIds: ids(17, 'arch'), visibleIds: ['arch-0'] };
  assert.equal(pickItemsForRun(nearLimit, NOW, { force: false }).picked.length, 1, 'repeated manual runs stop at the processing limit');
  const atLimit = { curatedItems, publishedIds: ids(18, 'arch'), visibleIds: [] };
  assert.equal(pickItemsForRun(atLimit, NOW, { force: false }).picked.length, 0);
  assert.equal(pickItemsForRun(atLimit, NOW, { force: true }).picked.length, 3, 'an operator-forced run lifts both caps');
});

test('picks the classifier expects to surface run before snippet-tier archive picks', () => {
  const curatedItems = [candidate('arch-a', 1, 0.3), candidate('sig-a', 2, 0.7), candidate('arch-b', 3, 0.2), candidate('sig-b', 4, 0.6)];
  const { picked } = pickItemsForRun({ curatedItems, publishedIds: [], visibleIds: [] }, NOW, { force: false });
  assert.deepEqual(picked.map((item) => item.id), ['sig-a', 'sig-b', 'arch-a'], 'model order is kept inside each group');
});

test('the day plan records processed and published items separately', () => {
  const next = updatePlanAfterRun({ curatedItems: [], publishedIds: ['a'], visibleIds: ['a'] }, [{ id: 'b' }, { id: 'c' }], 1, { visibleIds: ['c'] });
  assert.deepEqual(next.publishedIds, ['a', 'b', 'c']);
  assert.deepEqual(next.visibleIds, ['a', 'c']);
  assert.equal(next.slotPublications[1], true);
  assert.deepEqual(updatePlanAfterRun({ publishedIds: [] }, [{ id: 'x' }], 0).visibleIds, [], 'nothing counts as published by default');
});

test('the env template ships the same throughput caps as the code', async () => {
  const { readFile } = await import('node:fs/promises');
  const constants = await import('../scripts/lib/constants.mjs');
  const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  for (const key of ['DAILY_CURATION_TARGET', 'DAILY_PROCESSING_LIMIT', 'ITEMS_PER_RUN']) {
    const shipped = template.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];
    assert.equal(Number(shipped), constants[key], `${key} in .env.example`);
  }
});

test('an item counts as published only when the final sync left it on the public surface', () => {
  const processed = [{ id: 'memo' }, { id: 'card' }, { id: 'quarantined' }, { id: 'archived' }];
  const latest = [{ id: 'card' }, { id: 'older-story' }, { id: 'memo' }];
  assert.deepEqual(surfacedProcessedIds(latest, processed), ['memo', 'card']);
  assert.deepEqual(surfacedProcessedIds([], processed), []);
});

test('both pipeline outcomes record which processed items reached a public surface', async () => {
  const { readFile } = await import('node:fs/promises');
  const pipeline = await readFile(new URL('../scripts/pipeline.mjs', import.meta.url), 'utf8');
  assert.match(pipeline, /updatePlanAfterRun\(plan, processedItems, slot, \{ visibleIds: surfacedProcessedIds\(latest, processedItems\) \}\)/);
  assert.match(pipeline, /updatePlanAfterRun\(plan, finalProcessedItems, slot, \{\s*visibleIds: surfacedProcessedIds\(latest, finalProcessedItems\),\s*\}\)/);
  // Both calls follow the sync that produced \`latest\`.
  for (const call of ['updatePlanAfterRun(plan, processedItems', 'updatePlanAfterRun(plan, finalProcessedItems']) {
    const callAt = pipeline.indexOf(call);
    const syncAt = pipeline.lastIndexOf('await syncArchiveArtifacts(', callAt);
    assert.ok(syncAt > -1 && syncAt < callAt, `${call} runs after the archive sync`);
  }
  assert.match(pipeline, /fetchNewsPoolResult\(\{ sources, now, previousItems: previousPool, excludeIds: processedIds \}\)/);
  assert.match(pipeline, /loadPoolWithFallback\(existingLatest, sources, \{ processedIds: state\.publishedIds \|\| \[\] \}\)/);
});

test('the curation floor adds only on-beat candidates, full text first, up to three', () => {
  const ranked = [
    candidate('weak', 2, 0.3, 0.2),
    candidate('abstract', 1, 0.7, 0, { source_text_scope: 'abstract' }),
    candidate('ai-lane', 3, 0.2, 0.8),
    candidate('grid', 4, 0.62, 0),
    candidate('chips', 5, 0.58, 0),
  ];
  assert.deepEqual(applyCurationFloor([], ranked), ['ai-lane', 'grid', 'chips']);
  assert.deepEqual(applyCurationFloor(['weak'], ranked), ['weak', 'ai-lane', 'grid'], 'model picks stay first and count toward the floor');
  assert.deepEqual(applyCurationFloor(['a', 'b', 'c'], ranked), ['a', 'b', 'c']);
  const onlyWeak = [candidate('w1', 1, 0.3), candidate('w2', 2, 0.5, 0.4)];
  assert.deepEqual(applyCurationFloor([], onlyWeak), [], 'nothing below the relevance floor is added');
  assert.deepEqual(applyCurationFloor([], [candidate('abs', 1, 0.7, 0, { source_text_scope: 'abstract' })]), ['abs'], 'an abstract-only item still fills an empty plan');
});

test('candidates are fresh first, then older items within the week, and never older', () => {
  const pool = [candidate('fresh', 2), candidate('three-days', 72), candidate('ten-days', 240, 0.9)];
  assert.deepEqual(rollingCandidates(pool, { publishedIds: [] }, null, NOW).map((item) => item.id), ['fresh', 'three-days']);
  const quiet = [candidate('ten-days', 240, 0.9), candidate('twenty-days', 480, 0.95)];
  assert.deepEqual(rollingCandidates(quiet, { publishedIds: [] }, null, NOW), [], 'a quiet day never reaches past the maximum age');
  const published = rollingCandidates(pool, { publishedIds: ['fresh'] }, null, NOW).map((item) => item.id);
  assert.deepEqual(published, ['three-days']);
});

test('column candidates prefer the processed record over the raw pool copy, inside the anchor horizon', async () => {
  const { columnCandidateRecords } = await import('../scripts/pipeline.mjs');
  const { loadSourceRegistrySync } = await import('../scripts/lib/source-registry.mjs');
  const publishedAt = new Date(NOW.getTime() - 17 * 86_400_000).toISOString();
  const raw = {
    id: 'epoch-smuggling', sourceRegistryId: 'epoch-ai-data-insights', source: 'Epoch AI',
    url: 'https://epoch.ai/data-insights/malaysia-china-chip-smuggling', title: 'Trade data consistent with chips smuggled to China via Malaysia',
    publishedAt, infrastructure_relevance_score: 0.16, ai_topic_score: 0.18, pool_max_age_days: 21,
  };
  const processed = {
    ...raw,
    sourceUrl: raw.url,
    infrastructure_relevance_score: 0.281,
    ai_topic_score: 0.6,
    cleaned_source_text: 'China recorded server imports from Malaysia at AI server prices well above the matching Malaysian exports.',
    extraction_artifact: { source_url: raw.url, cleaned_extracted_text: 'China recorded server imports from Malaysia.' },
    archiveOnly: true,
  };
  const [candidate] = columnCandidateRecords({ latest: [], pool: [raw], existingArchive: [processed], now: NOW, sources: loadSourceRegistrySync() });
  assert.equal(candidate.ai_topic_score, 0.6, 'post-extraction scores win over fetch-time scores');
  assert.ok(candidate.extraction_artifact, 'the extraction artifact is kept');

  const tooOld = { ...processed, id: 'old', publishedAt: new Date(NOW.getTime() - 30 * 86_400_000).toISOString() };
  assert.equal(columnCandidateRecords({ latest: [], pool: [], existingArchive: [tooOld], now: NOW, sources: loadSourceRegistrySync() }).length, 0);
});

test('every column stage call reads the archive written in the same run', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile('scripts/pipeline.mjs', 'utf8');
  const calls = [...source.matchAll(/columnCandidateRecords\(\{[^}]*\}\)/g)].map((match) => match[0]);
  assert.equal(calls.length, 3);
  for (const call of calls) assert.match(call, /existingArchive: updatedArchive \|\| existingArchive/);
  assert.equal((source.match(/archive: updatedArchive/g) || []).length, 3, 'each syncArchiveArtifacts call keeps its returned archive');
});
