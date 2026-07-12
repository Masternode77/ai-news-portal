import assert from 'node:assert/strict';
import {
  articleHasExpertInsight,
  expertInsightUsageScore,
  extractExpertInsight,
  splitByExpertInsightGate,
} from './lib/expert-insight-engine.mjs';
import { attachExpertLens } from './lib/expert-lens.mjs';

const sourceArticle = {
  id: 'insight-source',
  title: 'Microsoft signs power deal for 300 MW AI data center campus in Texas',
  source: 'Compute Current Test',
  category: 'Power & Grid',
  primary_category: 'Power & Grid',
  infrastructure_layer: 'Power & Energy',
  summary: 'Microsoft said a Texas AI data center campus depends on a new power agreement and substation delivery.',
  snippet: 'The project includes 300 MW of planned load and a 2027 energization target.',
  articleText: [
    'Microsoft said its planned Texas AI data center campus depends on a new utility power agreement and substation delivery.',
    'The project includes 300 MW of planned load, a 2027 energization target, and phased cloud capacity for AI workloads.',
    'The company said the schedule depends on transformer procurement, interconnection work, and utility approvals.',
  ].join(' '),
  sourceUrl: 'https://example.com/microsoft-texas-power',
  publishedAt: '2026-05-17T00:00:00.000Z',
};

const insight = extractExpertInsight(sourceArticle);

assert.equal(insight.expert_insight_complete, true);
assert.ok(insight.concrete_facts.length >= 1);
assert.ok(insight.named_companies.includes('Microsoft'));
assert.equal(insight.infrastructure_layer, 'Power & Energy');
assert.equal(insight.bottleneck_type, 'power_grid');
assert.ok(insight.who_gains_leverage);
assert.ok(insight.who_takes_execution_risk);
assert.ok(insight.timing_dependency);
assert.ok(insight.counterargument);
assert.ok(insight.next_observable_signal);

const missing = extractExpertInsight({
  id: 'thin-source',
  title: 'AI demand remains strong',
  source: 'Compute Current Test',
  summary: 'Demand remains strong.',
  articleText: 'Demand remains strong.',
});
assert.equal(missing.expert_insight_complete, false);
assert.ok(missing.expert_insight_missing_fields.includes('concrete_facts'));

const gate = splitByExpertInsightGate([sourceArticle, { id: 'thin-source', title: 'AI demand remains strong' }]);
assert.equal(gate.publishable.length, 1);
assert.equal(gate.blocked.length, 1);
assert.equal(gate.blocked[0].articlePagePublished, false);
assert.equal(gate.blocked[0].expertInsightBlocked, true);

await assert.rejects(
  () => attachExpertLens([{
    ...sourceArticle,
    expert_insight: insight,
    expertInsight: insight,
  }]),
  (error) => error.code === 'editorial_service_unavailable',
);

assert.ok(articleHasExpertInsight({ ...sourceArticle, expert_insight: insight }));
assert.equal(expertInsightUsageScore(sourceArticle.articleText, insight) > 0, true);

console.log('expert insight engine tests passed');
