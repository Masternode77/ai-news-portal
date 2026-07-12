import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateEditorialMetadata,
  validateEditorialMetadataPayload,
} from '../scripts/lib/content.mjs';
import { validateStrictExpertLensPayload } from '../scripts/lib/expert-lens.mjs';
import { extractExpertInsight } from '../scripts/lib/expert-insight-engine.mjs';

test('strict editorial metadata rejects partial model output without deterministic fills', async () => {
  assert.equal(validateEditorialMetadataPayload({}), null);
  const article = { id: 'partial', summary: 'Source summary', tags: ['source'] };
  const result = await generateEditorialMetadata(article, { callJson: async () => ({}) });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'editorial_generation_invalid');
  assert.equal(result.article, article);
});

test('strict longform schema rejects partial model output before normalization', () => {
  assert.equal(validateStrictExpertLensPayload({ finalArticleBody: 'Long but incomplete.' }, {
    blueprintId: 'constraint-ledger',
    sourceLink: 'https://example.com/source',
  }), null);
});

test('strict editorial generation refuses fallback longform when the AI service is unavailable', async () => {
  const priorOffline = process.env.PIPELINE_OFFLINE;
  const priorKey = process.env.OPENROUTER_API_KEY;
  process.env.PIPELINE_OFFLINE = '1';
  delete process.env.OPENROUTER_API_KEY;
  try {
    const { attachExpertLensStrict } = await import(`../scripts/lib/expert-lens.mjs?strict=${Date.now()}`);
    const article = {
      id: 'strict-no-fallback',
      title: 'Microsoft power agreement sets the schedule for a 300 MW Texas AI campus',
      source: 'Compute Current Test',
      category: 'Power & Grid',
      primary_category: 'Power & Grid',
      infrastructure_layer: 'Power & Energy',
      summary: 'A 300 MW campus depends on a utility agreement, transformer delivery, and interconnection work.',
      snippet: 'The first halls target a 2027 energization date.',
      articleText: [
        'Microsoft said its planned Texas AI data center campus depends on a new utility power agreement and substation delivery.',
        'The project includes 300 MW of planned load, a 2027 energization target, and phased cloud capacity for AI workloads.',
        'The schedule depends on transformer procurement, interconnection work, and utility approvals.',
      ].join(' '),
      sourceUrl: 'https://example.com/microsoft-texas-power',
      publishedAt: '2026-05-17T00:00:00.000Z',
    };
    const insight = extractExpertInsight(article);
    await assert.rejects(
      () => attachExpertLensStrict([{ ...article, expert_insight: insight, expertInsight: insight }]),
      (error) => error.code === 'editorial_service_unavailable',
    );
    await assert.rejects(
      () => attachExpertLensStrict([{
        ...article,
        expert_insight: insight,
        expertInsight: insight,
        expertLensFull: {},
      }]),
      (error) => error.code === 'editorial_service_unavailable',
    );
  } finally {
    if (priorOffline === undefined) delete process.env.PIPELINE_OFFLINE;
    else process.env.PIPELINE_OFFLINE = priorOffline;
    if (priorKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = priorKey;
  }
});
