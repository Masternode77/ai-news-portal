import assert from 'node:assert/strict';
import test from 'node:test';
import { runEditorialCycle } from '../scripts/lib/editorial-cycle.mjs';

test('editorial cycle persists a no-publish state when no fresh cluster qualifies', async () => {
  const result = await runEditorialCycle({ useLive: false, now: '2026-05-20T05:13:19.000Z' });
  assert.ok(result.cycle.cycle_id);
  assert.match(result.cycle.status, /^completed_/);
  assert.ok(result.cycle.source_items_scanned >= result.cycle.clean_items);
  assert.ok(result.cycle.published_analyses.length <= 3);
});
