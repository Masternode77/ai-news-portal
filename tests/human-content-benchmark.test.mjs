import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRelevanceReviewPacket,
  buildWritingReviewPacket,
  predictBenchmarkArticle,
  scoreRelevanceReview,
  scoreWritingReview,
} from '../scripts/lib/human-content-benchmark.mjs';

function articles(count = 180) {
  return Array.from({ length: count }, (_, index) => {
    const core = index % 2 === 0;
    return {
      id: `benchmark-${index}`,
      title: core
        ? `AI data center ${index} adds grid-connected GPU capacity`
        : `Consumer chatbot app ${index} adds social video filters`,
      source: 'Benchmark Wire',
      sourceUrl: `https://example.com/${index}`,
      publishedAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      snippet: core
        ? 'The facility adds substations, liquid cooling, and accelerator racks.'
        : 'The mobile app update concerns creator workflows and consumer subscriptions.',
      contentText: core
        ? 'The AI data center facility adds utility interconnection capacity, GPU servers, and liquid cooling infrastructure.'
        : 'The consumer smartphone app adds chatbot filters for social media videos without physical infrastructure changes.',
      articleText: `${core ? 'The facility expansion is tied to measured grid and compute capacity.' : 'The app release changes consumer workflows.'} `.repeat(80),
    };
  });
}

function attest(packet, id) {
  packet.reviewer = {
    kind: 'independent_human',
    id,
    organization: 'Independent Review Desk',
    reviewed_at: '2026-07-12T00:00:00.000Z',
    independent_of_implementation: true,
    attestation: 'I reviewed every item from source evidence without seeing the current predictions.',
  };
}

test('review packets are deterministic, blind, and large enough for independent labeling', () => {
  const corpus = articles();
  const first = buildRelevanceReviewPacket(corpus, { generatedAt: '2026-07-12T00:00:00.000Z', seed: 'fixed' });
  const second = buildRelevanceReviewPacket(corpus, { generatedAt: '2026-07-12T00:00:00.000Z', seed: 'fixed' });
  const writing = buildWritingReviewPacket(corpus, { generatedAt: '2026-07-12T00:00:00.000Z', seed: 'fixed' });
  assert.deepEqual(first, second);
  assert.equal(first.items.length, 150);
  assert.equal(writing.items.length, 40);
  assert.equal(first.blind_to_current_predictions, true);
  assert.doesNotMatch(JSON.stringify(first.items), /predicted|public_routing|relevance_score/i);
  assert.ok(first.items.every((item) => item.input.source_digest.length === 64));
  assert.ok(writing.items.every((item) => item.input.article_digest.length === 64));
});

test('scoring requires completed independent labels and reports requested metrics', () => {
  const corpus = articles();
  const relevancePacket = buildRelevanceReviewPacket(corpus, { generatedAt: '2026-07-12T00:00:00.000Z' });
  const writingPacket = buildWritingReviewPacket(corpus, { generatedAt: '2026-07-12T00:00:00.000Z' });
  assert.throws(() => scoreRelevanceReview(relevancePacket, corpus), /reviewer.id is required/);
  attest(relevancePacket, 'relevance-reviewer');
  attest(writingPacket, 'writing-reviewer');

  const byId = new Map(corpus.map((article) => [article.id, article]));
  for (const item of relevancePacket.items) {
    const prediction = predictBenchmarkArticle(byId.get(item.input.id));
    item.labels = {
      ...prediction,
      reason_codes: ['physical_infrastructure_anchor'],
      notes: '',
    };
  }
  for (const item of writingPacket.items) {
    item.labels.accepted = true;
    item.labels.dimensions = Object.fromEntries(Object.keys(item.labels.dimensions).map((name) => [name, 5]));
  }

  const relevance = scoreRelevanceReview(relevancePacket, corpus);
  const writing = scoreWritingReview(writingPacket, corpus);
  assert.equal(relevance.pass, true);
  assert.equal(relevance.core_false_positive_rate, 0);
  assert.equal(relevance.route_accuracy, 1);
  assert.equal(relevance.category_accuracy, 1);
  assert.equal(relevance.human_reason_code_coverage, 1);
  assert.equal(relevance.prediction_reason_code_coverage, 1);
  assert.equal(writing.sample_size, 40);
  assert.equal(writing.accepted_rate, 1);
  assert.equal(writing.dimension_averages.source_fidelity, 5);
  assert.equal(writing.pass, true);

  const tamperedRelevance = structuredClone(relevancePacket);
  tamperedRelevance.items[0].input.title = 'Reviewer-edited source title';
  assert.throws(() => scoreRelevanceReview(tamperedRelevance, corpus), /source snapshot hash is invalid/);

  const placeholderReasons = structuredClone(relevancePacket);
  placeholderReasons.items[0].labels.reason_codes = ['human_source_review'];
  assert.throws(() => scoreRelevanceReview(placeholderReasons, corpus), /invalid human reason code/);

  const changedCorpus = structuredClone(corpus);
  const changedId = writingPacket.items[0].input.id;
  changedCorpus.find((article) => article.id === changedId).articleText = 'Changed after review. '.repeat(80);
  assert.throws(() => scoreWritingReview(writingPacket, changedCorpus), /article snapshot changed/);

  for (const item of writingPacket.items) {
    item.labels.accepted = false;
    item.labels.issue_codes = ['generic_language'];
  }
  assert.equal(scoreWritingReview(writingPacket, corpus).pass, false);
});
