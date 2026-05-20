import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { qualitySafeBackfill } from '../scripts/lib/quality-safe-backfill.mjs';

test('quality-safe backfill reaches launch homepage targets without source-card dominance', () => {
  const latest = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  const archive = JSON.parse(fs.readFileSync('src/data/archived-news.json', 'utf8'));
  const result = qualitySafeBackfill([...latest, ...archive], {
    days: 45,
    targetVisible: 20,
    targetLocal: 12,
    targetFull: 6,
  });
  assert.equal(result.meetsTargets, true);
  assert.ok(result.counts.visible >= 20);
  assert.ok(result.counts.local >= 12);
  assert.ok(result.counts.full >= 6);
  assert.ok(result.counts.source_cards / result.counts.visible <= 0.3);
});
