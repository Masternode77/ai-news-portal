import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateAuthoredColumn,
  normalizeAuthoredBody,
  selectColumnStory,
  verificationFeedback,
} from '../scripts/lib/authored-column-engine.mjs';
import { authoredColumnQualityResult } from '../scripts/lib/authored-column-policy.mjs';
import { headingSequence } from '../scripts/lib/visible-body-length.mjs';
import { resetLlmUsageForTests } from '../scripts/lib/llm-budget.mjs';
import { SOURCE_TEXT, WATCHLIST, STANCE_JSON, essayBody, essayJson, fixtureArticle } from './fixtures/authored-column-fixture.mjs';

function stubModel() {
  let call = 0;
  return async () => {
    call += 1;
    if (call === 1) return STANCE_JSON;
    return essayJson();
  };
}

test('engine skips cleanly without an api key', async () => {
  resetLlmUsageForTests();
  delete process.env.OPENROUTER_API_KEY;
  const result = await generateAuthoredColumn({ candidates: [fixtureArticle()], pool: [], state: {}, now: new Date() });
  assert.equal(result.column, null);
  assert.equal(result.skipReason, 'llm_disabled');
});

test('story selection enforces relevance and fact floors', () => {
  const weak = fixtureArticle({ id: 'weak', infrastructure_relevance_score: 0.5 });
  assert.equal(selectColumnStory({ candidates: [weak], pool: [] }), null);
  const strong = selectColumnStory({ candidates: [fixtureArticle()], pool: [] });
  assert.ok(strong);
  assert.equal(strong.article.id, 'wire-001');
});

test('full generation path produces a verified column record', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    const state = {};
    const now = new Date('2026-08-17T09:00:00Z');
    const result = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      recentRecords: [],
      existingColumns: [],
      state,
      now,
      callModel: stubModel(),
    });

    assert.ok(result.column, `expected a column, got ${JSON.stringify(result)}`);
    const column = result.column;
    assert.equal(column.content_origin, 'authored');
    assert.equal(column.generation_version, 'authored_column_v1');
    assert.equal(column.public_content_tier, 'authored_column');
    assert.equal(column.author.name, 'Rowan Hale');
    assert.ok(column.slug.includes('2026-08-17'));
    assert.ok(column.expertLensFull.finalArticleBody.includes(WATCHLIST));
    assert.equal(column.authored_quality.ok, true);
    assert.ok(column.authored_quality.metrics.words >= 700);
    assert.equal(column.story_key, 'https://example.com/northline-dakota');
    assert.equal(column.sources[0].name, 'Grid Journal');
    assert.equal(state.authored.columnsByDay['2026-08-17'], 1);
    assert.equal(state.authored.lastFailure, null);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});

test('verification failure publishes nothing and records the reason', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const state = {};
    let calls = 0;
    const badModel = async () => {
      calls += 1;
      if (calls === 1) return STANCE_JSON;
      return JSON.stringify({ headline: 'Too Short To Publish Anywhere Near The Bar', deck: 'A deck that is long enough to pass the standfirst window but backed by a body that is far too short.', body: 'One tiny paragraph that fails every structural check.' });
    };
    const result = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      state,
      now: new Date(),
      callModel: badModel,
    });
    assert.equal(result.column, null);
    assert.match(result.failure, /^verify:/);
    assert.ok(state.authored.lastFailure);
    assert.ok(calls >= 3, 'expected a retry voice pass before giving up');
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('story-key dedupe skips stories already covered', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const result = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      existingColumns: [{ story_key: 'https://example.com/northline-dakota', stance: { thesis: 'prior' } }],
      state: {},
      now: new Date(),
      callModel: stubModel(),
    });
    assert.equal(result.column, null);
    assert.equal(result.skipReason, 'no_qualifying_story');
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('daily cap and minimum gap are enforced', async () => {
  resetLlmUsageForTests();
  process.env.OPENROUTER_API_KEY = 'test-key';
  try {
    const now = new Date('2026-08-17T09:00:00Z');
    const capped = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      state: { authored: { lastColumnAt: '2026-08-17T01:00:00Z', columnsByDay: { '2026-08-17': 3 }, recentStoryKeys: [] } },
      now,
      callModel: stubModel(),
    });
    assert.match(capped.skipReason, /^daily_cap_reached/);

    const gapped = await generateAuthoredColumn({
      candidates: [fixtureArticle()],
      pool: [],
      state: { authored: { lastColumnAt: '2026-08-17T07:30:00Z', columnsByDay: { '2026-08-17': 1 }, recentStoryKeys: [] } },
      now,
      callModel: stubModel(),
    });
    assert.match(gapped.skipReason, /^min_gap_not_reached/);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('normalizeAuthoredBody converts markdown habits into gate-visible structure', () => {
  const markdownBody = essayBody()
    .split('\n\n')
    .map((block) => (headingSequence(block).length ? `## ${block}` : block))
    .join('\n\n');
  const normalized = normalizeAuthoredBody(markdownBody);
  assert.ok(headingSequence(normalized).length >= 4, 'markdown headings should be recognized after normalization');
  assert.ok(normalized.includes(WATCHLIST));
  assert.ok(!normalized.includes('##'));

  const glued = 'The Grid Answers First\nA paragraph glued to its heading by a single newline, which hides the heading from the block splitter entirely.';
  const isolated = normalizeAuthoredBody(glued);
  assert.deepEqual(headingSequence(isolated), ['The Grid Answers First']);

  const decorated = normalizeAuthoredBody('**Where I Could Be Wrong**\n\nPlain paragraph with **bold** and `code` markers that must not survive.');
  assert.deepEqual(headingSequence(decorated), ['Where I Could Be Wrong']);
  assert.ok(!decorated.includes('**') && !decorated.includes('`'));

  const fenced = normalizeAuthoredBody('```\nOn My Watchlist\n```\n\nBody text.');
  assert.ok(!fenced.includes('```'));
});

test('normalizeAuthoredBody leaves a compliant body unchanged', () => {
  const body = essayBody();
  assert.equal(normalizeAuthoredBody(body), body.trim());
});

test('verificationFeedback translates reason codes into actionable directives', () => {
  const feedback = verificationFeedback([
    'fewer_than_4_sections',
    'missing_watchlist_section',
    'unsupported_numeric_claims:2.5 GW,40 percent',
    'some_unknown_code',
  ]);
  assert.equal(feedback.length, 4);
  assert.match(feedback[0], /standalone plain-text line/);
  assert.match(feedback[1], new RegExp(WATCHLIST));
  assert.match(feedback[2], /2\.5 GW,40 percent/);
  assert.equal(feedback[3], 'some_unknown_code');
});

test('quality policy names the offending unsupported numbers', () => {
  // Empty ledger: every unit-bearing figure in the essay is unsupported, and
  // the reason must carry the concrete offenders for the retry feedback loop.
  const result = authoredColumnQualityResult({
    body: essayBody(),
    title: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and the anchor tenant just bought schedule risk priced as energy risk.',
    ledgerClaims: [],
    sourceText: SOURCE_TEXT,
  });
  assert.equal(result.ok, false);
  const claimReason = result.reasons.find((reason) => reason.startsWith('unsupported_numeric_claims'));
  assert.ok(claimReason, 'expected an unsupported numeric claims reason');
  assert.match(claimReason, /unsupported_numeric_claims:.*200 MW/);
});

test('quality policy rejects missing counterargument and watchlist sections', () => {
  const body = essayBody()
    .replace('Where I Could Be Wrong', 'A Neutral Heading Instead')
    .replace(WATCHLIST, 'Closing Notes');
  const result = authoredColumnQualityResult({
    body,
    title: 'The Dakota Grid Deal Is A Utility Execution Story Now',
    deck: 'Northline Power secured 200 MW for its Dakota AI campus, and the anchor tenant just bought schedule risk priced as energy risk.',
    ledgerClaims: [],
    sourceText: SOURCE_TEXT,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('missing_watchlist_section'));
  assert.ok(result.reasons.includes('missing_counterargument_section'));
});
