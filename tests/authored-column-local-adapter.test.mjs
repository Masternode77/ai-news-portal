import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAuthoredColumn, storyKeyFor } from '../scripts/lib/authored-column-engine.mjs';
import { resetLlmUsageForTests } from '../scripts/lib/llm-budget.mjs';
import { fixtureArticle, STANCE_JSON, essayJson } from './fixtures/authored-column-fixture.mjs';

test('default authored column provider remains disabled without an OpenRouter key', async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const result = await generateAuthoredColumn({ candidates: [fixtureArticle()], pool: [], state: {} });
    assert.equal(result.column, null);
    assert.equal(result.skipReason, 'llm_disabled');
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test('explicit local adapter runs the normal story and quality gates without an API key', async () => {
  resetLlmUsageForTests();
  const previous = process.env.OPENROUTER_API_KEY;
  const previousOffline = process.env.PIPELINE_OFFLINE;
  const previousMinWords = process.env.AUTHORED_MIN_WORDS;
  const previousMinChars = process.env.AUTHORED_MIN_CHARS;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.PIPELINE_OFFLINE;
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  let calls = 0;
  const localAdapter = async () => {
    calls += 1;
    return calls === 1 ? STANCE_JSON : essayJson();
  };
  try {
    const result = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      existingColumns: [],
      recentRecords: [],
      state: {},
      now: new Date('2026-08-23T09:00:00Z'),
      callModel: localAdapter,
      model: 'codex-session',
    });
    assert.ok(result.column, JSON.stringify(result));
    assert.equal(result.column.authored_quality.model, 'codex-session');
    assert.equal(result.column.authored_quality.ok, true);
    assert.ok(calls >= 3);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
    if (previousOffline === undefined) delete process.env.PIPELINE_OFFLINE;
    else process.env.PIPELINE_OFFLINE = previousOffline;
    if (previousMinWords === undefined) delete process.env.AUTHORED_MIN_WORDS;
    else process.env.AUTHORED_MIN_WORDS = previousMinWords;
    if (previousMinChars === undefined) delete process.env.AUTHORED_MIN_CHARS;
    else process.env.AUTHORED_MIN_CHARS = previousMinChars;
  }
});

test('EIA Today in Energy story keys retain the article id while dropping tracking parameters', () => {
  const id63304 = { sourceUrl: 'https://www.eia.gov/todayinenergy/detail.php?id=63304' };
  const id67704 = { sourceUrl: 'https://www.eia.gov/todayinenergy/detail.php?id=67704' };
  const tracked = { sourceUrl: 'https://www.eia.gov/todayinenergy/detail.php?id=63304&utm_source=rss' };
  assert.notEqual(storyKeyFor(id63304), storyKeyFor(id67704));
  assert.equal(storyKeyFor(id63304), storyKeyFor(tracked));
});
