import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildHomepageLaunchModel } from '../scripts/lib/homepage-launch-model.mjs';

test('homepage launch model exposes a populated intelligence board', () => {
  const latest = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  const model = buildHomepageLaunchModel({ latest });
  const visible = [...model.featured, ...model.lanes.flatMap((lane) => lane.items)];
  const local = visible.filter((item) => item.kind === 'local');
  const sourceOnly = visible.filter((item) => item.kind === 'source');
  assert.ok(visible.length >= 20);
  assert.ok(local.length >= 12);
  assert.ok(sourceOnly.length / visible.length <= 0.3);
  assert.ok(model.hero.title.includes('Compute Current'));
  assert.ok(model.hero.cta.includes('Daily AI Infrastructure Brief'));
});
