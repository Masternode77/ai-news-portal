import assert from 'node:assert/strict';
import test from 'node:test';
import { columnCoverageBeat, recentColumnCoverage } from '../scripts/lib/column-coverage.mjs';
import { generateAuthoredColumn, selectColumnStoryWithDiagnostics } from '../scripts/lib/authored-column-engine.mjs';
import { FIXTURE_SOURCE, fixtureArticle, STANCE_JSON, essayJson } from './fixtures/authored-column-fixture.mjs';
import { selectPoolItems } from '../scripts/lib/fetch-feeds.mjs';
import { rollingCandidates } from '../scripts/lib/curate.mjs';
import { rankWithDiversity } from '../scripts/lib/rank.mjs';

const now = new Date('2026-10-04T12:00:00Z');
const recentPolicy = [{ id: 'prior-policy', title: 'Commission proposes data center ratings', publishedAt: '2026-10-03T12:00:00Z' }];
const candidate = (id, title, score = 0.92, extra = {}) => fixtureArticle({
  id, title, sourceUrl: `https://example.com/${id}`, publishedAt: '2026-10-04T09:00:00Z',
  infrastructure_relevance_score: score, ai_topic_score: 0, ...extra,
});
const select = (candidates, extra = {}) => selectColumnStoryWithDiagnostics({
  candidates, sources: [FIXTURE_SOURCE], existingColumns: recentPolicy, now, ...extra,
});

test('feed intake ranks the existing AI lane without promoting its wire publication tier', () => {
  const ai = { ...candidate('ai', 'OpenAI changes model pricing', 0.3), source: 'AI source', ai_topic_score: 0.95, infrastructure_relevance_tier: 'archive_only' };
  const policy = { ...candidate('policy', 'Commission proposes ratings', 0.8), source: 'Policy source', infrastructure_relevance_tier: 'full_memo' };
  const items = selectPoolItems([policy, ai], now.getTime());
  assert.equal(items[0].id, 'ai');
  assert.equal(items[0].infrastructure_relevance_tier, 'archive_only');
  assert.equal(items[1].id, 'policy');
});

test('deterministic curation fallback retains AI relevance after the intake ordering', () => {
  const ai = { ...candidate('ai', 'OpenAI changes model pricing', 0.1), source: 'AI source', ai_topic_score: 0.95, infrastructure_relevance_tier: 'signal_card' };
  const policy = { ...candidate('policy', 'Commission proposes ratings', 0.8), source: 'Policy source', ai_topic_score: 0.1 };
  assert.equal(rankWithDiversity([policy, ai])[0].id, 'ai');
  assert.equal(rollingCandidates([policy, ai], {}, null, now)[0].id, 'ai');
  assert.equal(ai.infrastructure_relevance_tier, 'signal_card');
});

test('coverage follows the news angle across AI, operators, hardware, energy and policy', () => {
  for (const [title, beat] of [
    ['OpenAI changes model API pricing for enterprise inference', 'ai_business'],
    ['Anthropic raises funding to expand model serving', 'ai_business'],
    ['Google Cloud AI: Anthropic Claude model is available in Model Garden', 'ai_business'],
    ['Equinix reports stronger leasing and quarterly earnings', 'data_center_operators'],
    ['Digital Realty signs a campus lease with a cloud customer', 'data_center_operators'],
    ['CoreWeave closes financing for capacity expansion', 'data_center_operators'],
    ['AWS opens a cloud region for enterprise customers', 'data_center_operators'],
    ['NVIDIA unveils a GPU networking system', 'compute_hardware'],
    ['SK hynix expands HBM packaging', 'compute_hardware'],
    ['Cloud operator qualifies liquid cooling equipment', 'power_cooling'],
    ['Commission proposes data center ratings', 'policy'],
    ['EU data center ratings could make heat reuse a commercial test', 'policy'],
    ['Amazon receives a zoning permit for a campus', 'policy'],
  ]) assert.equal(columnCoverageBeat({ title, primary_category: 'Policy & Siting' }), beat, title);
  assert.equal(columnCoverageBeat({ title: 'Administrative update' }), 'other_infrastructure');
});

test('recent coverage is bounded, sorted and excludes future, invalid and stale columns', () => {
  const records = Array.from({ length: 8 }, (_, i) => ({ title: 'OpenAI changes API pricing', publishedAt: `2026-09-${20 + i}T12:00:00Z` }));
  records.push(...recentPolicy, { title: 'Policy', publishedAt: '2026-10-05' }, { publishedAt: 'invalid' }, { publishedAt: '2026-08-01' });
  const result = recentColumnCoverage(records, now);
  assert.equal(result.total, 5);
  assert.equal(result.lastBeat, 'policy');
  assert.equal(result.counts.policy, 1);
  assert.equal(result.counts.ai_business, 4);
});

test('near-equal eligible AI and operator stories can rotate after policy coverage', () => {
  const policy = candidate('policy', 'Commission proposes data center ratings', 0.96);
  for (const [id, title, beat] of [
    ['ai', 'OpenAI changes model pricing', 'ai_business'],
    ['operator', 'Equinix signs new colocation leases', 'data_center_operators'],
  ]) {
    const alternative = candidate(id, title, 0.9);
    const result = select([policy, alternative]);
    assert.equal(result.selection.article.id, id);
    assert.equal(result.diagnostics.selected_beat, beat);
    assert.equal(result.diagnostics.selection_reason, 'coverage_near_tie');
    assert.equal(result.diagnostics.by_beat[beat].qualifying, 1);
    assert.equal(result.diagnostics.by_beat.policy.candidates, 1);
    assert.equal(select([policy, alternative], { existingColumns: [] }).selection.article.id, 'policy');
  }
});

test('a materially stronger story wins and policy remains eligible when it is the only good source', () => {
  const policy = candidate('policy', 'Commission proposes data center ratings', 1);
  const operator = candidate('operator', 'Equinix signs colocation leases', 0.76);
  assert.equal(select([policy, operator]).selection.article.id, 'policy');
  assert.equal(select([policy]).selection.article.id, 'policy');
  assert.equal(select([]).selection, null);
});

test('diversity never bypasses source rights, extraction, abstract or relevance gates', () => {
  const policy = candidate('policy', 'Commission proposes data center ratings');
  const blocked = [
    candidate('no-rights', 'Equinix signs colocation leases', 1, { sourceRegistryId: 'unregistered', source: 'Unknown', sourceUrl: 'https://unknown.example/article' }),
    candidate('thin', 'OpenAI changes model pricing', 1, { extraction_qa: { public_publishable: false, can_generate_longform: false, block_reasons: ['thin'] } }),
    candidate('abstract', 'GPU memory research', 1, { source_text_scope: 'abstract' }),
    candidate('weak', 'AI selfie app launches', 0.2, { ai_topic_score: 0.3 }),
  ];
  const result = select([policy, ...blocked]);
  assert.equal(result.selection.article.id, 'policy');
  assert.equal(result.diagnostics.counts.qualifying, 1);
  for (const reason of ['text_rights_unauthorized', 'extraction_ineligible', 'abstract_only', 'relevance_below_threshold']) assert.equal(result.diagnostics.counts[reason], 1);
});

test('generation persists selected beat and coverage diagnostics without changing frequency limits', async () => {
  const state = {};
  let calls = 0;
  process.env.AUTHORED_MIN_WORDS = '700';
  process.env.AUTHORED_MIN_CHARS = '4200';
  try {
    const result = await generateAuthoredColumn({
      candidates: [candidate('operator', 'Northline opens a data center campus')],
      existingColumns: recentPolicy, state, sources: [FIXTURE_SOURCE], now,
      callModel: async request => {
        assert.match(request.systemPrompt, /Policy is one beat, not the default frame/);
        assert.match(request.systemPrompt, /provider's claims/);
        calls += 1;
        return calls === 1 ? STANCE_JSON : essayJson();
      },
    });
    assert.ok(result.column, JSON.stringify(result));
    assert.equal(result.column.coverage_beat, 'data_center_operators');
    assert.equal(state.authored.lastSelection.diagnostics.selected_beat, 'data_center_operators');
    const next = await generateAuthoredColumn({ state, now, callModel: async () => { throw new Error('must respect interval'); } });
    assert.match(next.skipReason, /^min_gap_not_reached/);
  } finally {
    delete process.env.AUTHORED_MIN_WORDS;
    delete process.env.AUTHORED_MIN_CHARS;
  }
});
