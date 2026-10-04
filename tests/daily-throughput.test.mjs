import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCurationFloor, pickItemsForRun, rollingCandidates } from '../scripts/lib/curate.mjs';

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

test('a slot that already ran no longer blocks the next run, but each run and day are capped', () => {
  const curatedItems = Array.from({ length: 12 }, (_, index) => candidate(`c${index}`, index));
  const plan = { curatedItems, publishedIds: ['c0'], slotPublications: { 0: true, 1: true, 2: true } };
  const { picked } = pickItemsForRun(plan, NOW, { force: false });
  assert.deepEqual(picked.map((item) => item.id), ['c1', 'c2', 'c3']);

  const nearlyFull = { ...plan, publishedIds: Array.from({ length: 8 }, (_, index) => `done-${index}`) };
  assert.equal(pickItemsForRun(nearlyFull, NOW, { force: false }).picked.length, 1, 'the ninth item of the day is the last one');
  const full = { ...plan, publishedIds: Array.from({ length: 9 }, (_, index) => `done-${index}`) };
  assert.equal(pickItemsForRun(full, NOW, { force: false }).picked.length, 0);
  assert.equal(pickItemsForRun(full, NOW, { force: true }).picked.length, 3, 'an operator-forced run lifts the daily cap');
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
