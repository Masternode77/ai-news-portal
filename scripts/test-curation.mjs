import assert from 'node:assert/strict';
import { planForToday, pickItemsForRun, updatePlanAfterRun } from './lib/curate.mjs';

function item(id, hoursOld, source = 'Source') {
  const publishedAt = new Date(Date.UTC(2026, 4, 4, 12) - hoursOld * 60 * 60 * 1000).toISOString();
  return {
    id,
    source,
    url: `https://example.com/${id}`,
    title: `AI data center update ${id}`,
    snippet: `GPU cloud power cooling story ${id}`,
    contentText: `AI infrastructure and data center capacity story ${id}`,
    publishedAt,
    defaultCategory: 'AI Infrastructure (GPU/Neocloud)',
  };
}

const now = new Date(Date.UTC(2026, 4, 4, 12));
const previousPlan = {
  date: '2026-05-04',
  createdAt: new Date(Date.UTC(2026, 4, 3, 15)).toISOString(),
  curatedItems: [
    item('old-a', 30, 'Old A'),
    item('old-b', 31, 'Old B'),
    item('old-c', 32, 'Old C'),
    item('old-d', 33, 'Old D'),
    item('old-e', 34, 'Old E'),
    item('old-f', 35, 'Old F'),
  ],
  curatedIds: ['old-a', 'old-b', 'old-c', 'old-d', 'old-e', 'old-f'],
  publishedIds: ['old-a', 'old-b'],
  slotPublications: { 0: true },
};

const state = {
  publishedIds: ['old-a', 'old-b'],
  dayPlans: {
    '2026-05-04': previousPlan,
  },
  runHistory: [],
  lastRunAt: previousPlan.createdAt,
};

const pool = [
  ...previousPlan.curatedItems,
  item('fresh-a', 1, 'Fresh A'),
  item('fresh-b', 2, 'Fresh B'),
  item('fresh-c', 3, 'Fresh C'),
  item('fresh-d', 4, 'Fresh D'),
  item('fresh-e', 5, 'Fresh E'),
  item('fresh-f', 6, 'Fresh F'),
];

const { key, plan } = await planForToday(pool, state, now);

assert.equal(key, '2026-05-04');
assert.equal(plan.slotPublications[0], true);
assert.deepEqual(plan.publishedIds, ['old-a', 'old-b']);
assert.ok(plan.refreshedAt);
assert.ok(plan.curatedIds.includes('fresh-a'));
assert.ok(plan.curatedIds.includes('fresh-b'));
assert.ok(!plan.curatedIds.includes('old-a'));
assert.ok(!plan.curatedIds.includes('old-b'));

const { slot, picked } = pickItemsForRun(plan, now);
assert.equal(slot, 2);
assert.equal(picked.length, 3);
assert.ok(picked.every((pickedItem) => pickedItem.id.startsWith('fresh-')));

const updatedPlan = updatePlanAfterRun(plan, picked, slot);
assert.equal(updatedPlan.slotPublications[2], true);
assert.ok(picked.every((pickedItem) => updatedPlan.publishedIds.includes(pickedItem.id)));

// A slot that already ran no longer blocks a later run in the same slot.
const again = pickItemsForRun(updatedPlan, now);
assert.equal(again.picked.length, 3);
assert.ok(again.picked.every((pickedItem) => !updatedPlan.publishedIds.includes(pickedItem.id)));

// The day stops once nine items reached a public surface unless the run is
// forced. Archive-only outcomes count toward the processing limit only.
const done = (count) => Array.from({ length: count }, (_, index) => `done-${index}`);
const capped = { ...updatedPlan, publishedIds: done(9), visibleIds: done(9) };
assert.equal(pickItemsForRun(capped, now).picked.length, 0);
assert.equal(pickItemsForRun(capped, now, { force: true }).picked.length, 3);
const archivedOnly = { ...updatedPlan, publishedIds: done(9), visibleIds: [] };
assert.ok(pickItemsForRun(archivedOnly, now).picked.length > 0, 'nine archive-only outcomes do not close the day');
const processingLimit = { ...updatedPlan, publishedIds: done(18), visibleIds: [] };
assert.equal(pickItemsForRun(processingLimit, now).picked.length, 0);

console.log('curation rolling freshness test passed');
