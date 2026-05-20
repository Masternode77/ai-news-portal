import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEditorialArticleV3, EDITORIAL_ENGINE_V3_VERSION, LAUNCH_GENERATION_VERSION } from '../scripts/lib/editorial-article-engine-v3.mjs';

function sourceText() {
  const sentences = [
    'A regional utility and a data center developer described a new planning framework for large AI compute loads, including interconnection timing, cooling design assumptions, and staged capacity commitments.',
    'The report said the project team is using phased energization, liquid cooling readiness, and explicit load forecasting to reduce execution risk before larger procurement decisions are made.',
    'It also noted that buyers are asking for clearer delivery calendars, power availability assumptions, and operational support models before signing capacity-linked agreements.',
    'The source does not claim that all capacity is available today, but it gives operators and investors concrete planning points to monitor over the next several quarters.',
  ];
  return Array.from({ length: 9 }, (_, index) => sentences[index % sentences.length]).join(' ');
}

test('editorial article engine v3 produces a public-only launch model', () => {
  const result = buildEditorialArticleV3({
    id: 'engine-v3-fixture',
    title: 'Utility and data center developer formalize AI load planning framework',
    source: 'Data Center Frontier',
    sourceUrl: 'https://example.com/ai-load-planning',
    publishedAt: new Date().toISOString(),
    infrastructure_relevance_score: 0.96,
    source_type: 'trade_source',
    source_count: 2,
    rawText: sourceText(),
  });

  assert.equal(result.ok, true, result.reasons?.join(', '));
  assert.equal(result.article.public_generation_version, LAUNCH_GENERATION_VERSION);
  assert.equal(result.article.editorial_engine_version, EDITORIAL_ENGINE_V3_VERSION);
  assert.equal(result.article.public_publish_blocked, false);
  assert.ok(result.article.article_body_markdown.includes('Bottom Line'));
  assert.ok(result.article.article_body_markdown.includes('What This Does Not Prove') || result.article.article_body_markdown.includes('Limitation'));
  assert.equal(result.article.public_model?.evidence_pack, undefined);
  assert.equal(result.article.public_model?.claim_ledger, undefined);
});
