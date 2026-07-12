import { createHash } from 'node:crypto';
import { classifyTaxonomy, PRIMARY_CATEGORIES } from './taxonomy.mjs';
import { routeGradedPublishing, GRADED_ROUTES } from './graded-publishing-router.mjs';
import { routeStrictInfrastructureRelevance } from './strict-infrastructure-relevance-router.mjs';

export const RELEVANCE_SAMPLE_SIZE = 150;
export const WRITING_SAMPLE_SIZE = 40;
export const WRITING_ACCEPTANCE_RATE_MIN = 0.8;
export const WRITING_DIMENSION_AVERAGE_MIN = 4;
export const RELEVANCE_LABELS = Object.freeze([
  'core',
  'adjacent',
  'irrelevant',
  'duplicate',
  'extraction_failure',
]);
export const ROUTE_LABELS = Object.freeze([
  'source_signal',
  'editorial_brief',
  'analyst_note',
  'deep_dive',
  'archive_only',
]);
export const HUMAN_REASON_CODES = Object.freeze([
  'physical_infrastructure_anchor',
  'direct_capacity_decision',
  'adjacent_infrastructure_dependency',
  'generic_ai_consumer',
  'duplicate_source',
  'extraction_failure',
  'insufficient_evidence',
  'stale_or_irrelevant',
  'route_depth_supported',
  'route_depth_insufficient',
]);
export const WRITING_DIMENSIONS = Object.freeze([
  'source_fidelity',
  'thesis_specificity',
  'evidence_use',
  'implication_specificity',
  'limitation_quality',
  'watch_item_quality',
  'human_style',
]);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clean(value = '', limit = 12_000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function sourceEvidence(article = {}) {
  return clean(
    article.cleaned_source_text
      || article.contentText
      || article.extractedText
      || article.sourceText
      || article.snippet,
  );
}

function articleBody(article = {}) {
  return clean(
    article.expertLensFull?.finalArticleBody
      || article.finalArticleBody
      || article.articleText,
    24_000,
  );
}

function sourceSnapshot(article = {}) {
  const input = {
    id: String(article.id || '').trim(),
    title: clean(article.title, 500),
    source: clean(article.source, 200),
    source_url: clean(article.sourceUrl || article.url, 2_000),
    published_at: clean(article.publishedAt || article.analysisPublishedAt, 100),
    snippet: clean(article.snippet, 2_000),
    source_evidence: sourceEvidence(article),
  };
  return { ...input, source_digest: digest(input) };
}

function packetSourceInput(input = {}) {
  return {
    id: input.id,
    title: input.title,
    source: input.source,
    source_url: input.source_url,
    published_at: input.published_at,
    snippet: input.snippet,
    source_evidence: input.source_evidence,
  };
}

function isExtractionFailure(article = {}) {
  const status = clean(article.extraction_status || article.extraction_qa?.status).toLowerCase();
  return article.extraction_failed === true
    || article.extraction_ok === false
    || status === 'failed'
    || status === 'extraction_failed';
}

function isDuplicate(article = {}) {
  const reason = clean(article.archiveOnlyReason || article.quarantine_reason).toLowerCase();
  return article.duplicate === true
    || article.isDuplicate === true
    || Boolean(article.duplicate_of || article.duplicateOf)
    || reason.includes('duplicate');
}

function explicitRoute(article = {}) {
  return clean(article.blog_route || article.publishing_route || article.public_content_tier)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function predictedRoute(article = {}, graded = {}) {
  const explicit = explicitRoute(article);
  if (explicit.includes('deep_dive')) return 'deep_dive';
  if (explicit.includes('analyst_note')) return 'analyst_note';
  if (explicit.includes('editorial_brief')) return 'editorial_brief';
  if (explicit.includes('source_signal') || explicit.includes('signal_card')) return 'source_signal';

  if (graded.route === GRADED_ROUTES.CORE_LONGFORM_BLOG) return 'analyst_note';
  if (graded.route === GRADED_ROUTES.STANDARD_BLOG) return 'editorial_brief';
  if (graded.route === GRADED_ROUTES.SHORT_SIGNAL || graded.route === GRADED_ROUTES.SOURCE_CARD) {
    return 'source_signal';
  }
  return 'archive_only';
}

export function predictBenchmarkArticle(article = {}) {
  const strict = routeStrictInfrastructureRelevance(article);
  const graded = routeGradedPublishing(article);
  const relevanceClass = predictedRelevanceClass(article, strict);

  const reasons = [...new Set([
    strict.routing_decision,
    ...(strict.blocked_reasons || []),
    ...(graded.reasons || []),
  ].filter(Boolean))];

  return {
    relevance_class: relevanceClass,
    route_class: predictedRoute(article, graded),
    primary_category: classifyTaxonomy(article).primary_category,
    reason_codes: reasons.length ? reasons : ['unclassified_route'],
  };
}

function predictedRelevanceClass(article = {}, strict = routeStrictInfrastructureRelevance(article)) {
  let relevanceClass = strict.visibility === 'core'
    ? 'core'
    : strict.visibility === 'adjacent'
      ? 'adjacent'
      : 'irrelevant';
  if (isExtractionFailure(article)) relevanceClass = 'extraction_failure';
  if (isDuplicate(article)) relevanceClass = 'duplicate';
  return relevanceClass;
}

function deterministicOrder(items = [], seed = '') {
  return [...items].sort((left, right) => {
    const leftKey = digest(`${seed}:${left.id}`);
    const rightKey = digest(`${seed}:${right.id}`);
    return leftKey.localeCompare(rightKey);
  });
}

function uniqueArticles(articles = []) {
  const byId = new Map();
  for (const article of articles) {
    const id = String(article?.id || '').trim();
    if (id && !byId.has(id)) byId.set(id, article);
  }
  return [...byId.values()];
}

function balancedRelevanceSample(articles = [], size, seed) {
  const groups = new Map(RELEVANCE_LABELS.map((label) => [label, []]));
  for (const article of uniqueArticles(articles)) {
    groups.get(predictedRelevanceClass(article)).push(article);
  }
  for (const [label, items] of groups) groups.set(label, deterministicOrder(items, `${seed}:${label}`));

  const selected = [];
  const selectedIds = new Set();
  while (selected.length < size) {
    let added = false;
    for (const label of RELEVANCE_LABELS) {
      const article = groups.get(label).shift();
      if (!article || selectedIds.has(article.id)) continue;
      selected.push(article);
      selectedIds.add(article.id);
      added = true;
      if (selected.length === size) break;
    }
    if (!added) break;
  }

  if (selected.length < size) {
    for (const article of deterministicOrder(uniqueArticles(articles), `${seed}:fill`)) {
      if (selectedIds.has(article.id)) continue;
      selected.push(article);
      selectedIds.add(article.id);
      if (selected.length === size) break;
    }
  }
  return selected;
}

function reviewerTemplate() {
  return {
    kind: 'independent_human',
    id: '',
    organization: '',
    reviewed_at: '',
    independent_of_implementation: null,
    attestation: '',
  };
}

export function buildRelevanceReviewPacket(articles = [], options = {}) {
  const size = Number(options.size || RELEVANCE_SAMPLE_SIZE);
  if (uniqueArticles(articles).length < size) {
    throw new Error(`relevance benchmark requires ${size} unique historical items`);
  }
  const seed = String(options.seed || 'compute-current-gpt56-v1');
  const selected = balancedRelevanceSample(articles, size, seed);
  const items = selected.map((article) => ({
    input: sourceSnapshot(article),
    labels: {
      relevance_class: null,
      route_class: null,
      primary_category: null,
      reason_codes: [],
      notes: '',
    },
  }));
  return {
    schema_version: 1,
    kind: 'compute_current_relevance_review',
    generated_at: options.generatedAt || new Date().toISOString(),
    seed,
    blind_to_current_predictions: true,
    sample_size: items.length,
    allowed_labels: {
      relevance_class: RELEVANCE_LABELS,
      route_class: ROUTE_LABELS,
      primary_category: PRIMARY_CATEGORIES,
      reason_codes: HUMAN_REASON_CODES,
    },
    reviewer: reviewerTemplate(),
    instructions: 'Label from the source snapshot only. Do not inspect current routing or generated metadata.',
    items,
  };
}

export function buildWritingReviewPacket(articles = [], options = {}) {
  const size = Number(options.size || WRITING_SAMPLE_SIZE);
  const seed = String(options.seed || 'compute-current-gpt56-v1');
  const candidates = uniqueArticles(articles).filter((article) => articleBody(article).length >= 500);
  if (candidates.length < size) throw new Error(`writing benchmark requires ${size} historical articles with reviewable copy`);
  const selected = deterministicOrder(candidates, `${seed}:writing`).slice(0, size);
  const items = selected.map((article) => {
    const source = sourceSnapshot(article);
    const articleText = articleBody(article);
    return {
      input: {
        ...source,
        article_text: articleText,
        article_digest: digest({ source_digest: source.source_digest, article_text: articleText }),
      },
      labels: {
        accepted: null,
        dimensions: Object.fromEntries(WRITING_DIMENSIONS.map((name) => [name, null])),
        issue_codes: [],
        notes: '',
      },
    };
  });
  return {
    schema_version: 1,
    kind: 'compute_current_writing_review',
    generated_at: options.generatedAt || new Date().toISOString(),
    seed,
    blind_to_current_quality_scores: true,
    sample_size: items.length,
    score_scale: { min: 1, max: 5 },
    reviewer: reviewerTemplate(),
    instructions: 'Judge the article against its source evidence. Mark unsupported claims in issue_codes.',
    items,
  };
}

function assertReviewer(packet = {}) {
  const reviewer = packet.reviewer || {};
  if (reviewer.kind !== 'independent_human') throw new Error('reviewer.kind must be independent_human');
  if (!clean(reviewer.id)) throw new Error('reviewer.id is required');
  if (!Number.isFinite(Date.parse(reviewer.reviewed_at))) throw new Error('reviewer.reviewed_at must be an ISO timestamp');
  if (reviewer.independent_of_implementation !== true) {
    throw new Error('reviewer must attest independence from implementation');
  }
  if (clean(reviewer.attestation).length < 20) throw new Error('reviewer.attestation must describe the human review');
}

function articleIndex(articles = []) {
  return new Map(uniqueArticles(articles).map((article) => [String(article.id), article]));
}

function assertSourceUnchanged(item = {}, article = {}) {
  if (digest(packetSourceInput(item.input)) !== item.input?.source_digest) {
    throw new Error(`source snapshot hash is invalid for benchmark item ${item.input?.id || '(missing id)'}`);
  }
  const current = sourceSnapshot(article);
  if (current.source_digest !== item.input?.source_digest) {
    throw new Error(`source snapshot changed for benchmark item ${item.input?.id || '(missing id)'}`);
  }
}

function assertArticleUnchanged(item = {}, article = {}) {
  const articleText = articleBody(article);
  const expectedDigest = digest({ source_digest: item.input?.source_digest, article_text: item.input?.article_text });
  if (expectedDigest !== item.input?.article_digest) {
    throw new Error(`article snapshot hash is invalid for benchmark item ${item.input?.id || '(missing id)'}`);
  }
  if (articleText !== item.input.article_text) {
    throw new Error(`article snapshot changed for benchmark item ${item.input?.id || '(missing id)'}`);
  }
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

export function scoreRelevanceReview(packet = {}, articles = []) {
  assertReviewer(packet);
  if (packet.kind !== 'compute_current_relevance_review') throw new Error('invalid relevance review packet');
  if (!Array.isArray(packet.items) || packet.items.length < RELEVANCE_SAMPLE_SIZE) {
    throw new Error(`relevance review requires at least ${RELEVANCE_SAMPLE_SIZE} labeled items`);
  }
  const byId = articleIndex(articles);
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  let relevanceMatches = 0;
  let routeMatches = 0;
  let categoryMatches = 0;
  let humanReasonCovered = 0;
  let predictionReasonCovered = 0;
  let genericConsumerCoreFalsePositives = 0;

  for (const item of packet.items) {
    const expected = item.labels || {};
    if (!RELEVANCE_LABELS.includes(expected.relevance_class)) throw new Error(`invalid relevance label for ${item.input?.id}`);
    if (!ROUTE_LABELS.includes(expected.route_class)) throw new Error(`invalid route label for ${item.input?.id}`);
    if (!PRIMARY_CATEGORIES.includes(expected.primary_category)) throw new Error(`invalid category label for ${item.input?.id}`);
    if (!Array.isArray(expected.reason_codes) || !expected.reason_codes.length) {
      throw new Error(`human reason_codes are required for ${item.input?.id}`);
    }
    if (expected.reason_codes.some((code) => !HUMAN_REASON_CODES.includes(code))) {
      throw new Error(`invalid human reason code for ${item.input?.id}`);
    }
    const article = byId.get(String(item.input?.id));
    if (!article) throw new Error(`benchmark item ${item.input?.id} is missing from the current corpus`);
    assertSourceUnchanged(item, article);
    const actual = predictBenchmarkArticle(article);
    const expectedCore = expected.relevance_class === 'core';
    const actualCore = actual.relevance_class === 'core';
    if (expectedCore && actualCore) truePositive += 1;
    else if (!expectedCore && actualCore) falsePositive += 1;
    else if (!expectedCore && !actualCore) trueNegative += 1;
    else falseNegative += 1;
    if (expected.relevance_class === actual.relevance_class) relevanceMatches += 1;
    if (expected.route_class === actual.route_class) routeMatches += 1;
    if (expected.primary_category === actual.primary_category) categoryMatches += 1;
    humanReasonCovered += 1;
    if (actual.reason_codes.length) predictionReasonCovered += 1;
    if (!expectedCore && actualCore && expected.reason_codes.includes('generic_ai_consumer')) {
      genericConsumerCoreFalsePositives += 1;
    }
  }

  const total = packet.items.length;
  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);
  const falsePositiveRate = ratio(falsePositive, falsePositive + trueNegative);
  const result = {
    sample_size: total,
    confusion_matrix: { true_positive: truePositive, false_positive: falsePositive, true_negative: trueNegative, false_negative: falseNegative },
    core_precision: precision,
    core_recall: recall,
    core_false_positive_rate: falsePositiveRate,
    relevance_accuracy: ratio(relevanceMatches, total),
    route_accuracy: ratio(routeMatches, total),
    category_accuracy: ratio(categoryMatches, total),
    human_reason_code_coverage: ratio(humanReasonCovered, total),
    prediction_reason_code_coverage: ratio(predictionReasonCovered, total),
    generic_consumer_core_false_positives: genericConsumerCoreFalsePositives,
  };
  return {
    ...result,
    pass: falsePositiveRate < 0.05
      && genericConsumerCoreFalsePositives === 0
      && result.human_reason_code_coverage === 1
      && result.prediction_reason_code_coverage === 1,
  };
}

export function scoreWritingReview(packet = {}, articles = []) {
  assertReviewer(packet);
  if (packet.kind !== 'compute_current_writing_review') throw new Error('invalid writing review packet');
  if (!Array.isArray(packet.items) || packet.items.length < WRITING_SAMPLE_SIZE) {
    throw new Error(`writing review requires at least ${WRITING_SAMPLE_SIZE} labeled items`);
  }
  const byId = articleIndex(articles);
  const dimensionTotals = Object.fromEntries(WRITING_DIMENSIONS.map((name) => [name, 0]));
  let accepted = 0;
  let unsupportedClaimItems = 0;

  for (const item of packet.items) {
    const labels = item.labels || {};
    if (typeof labels.accepted !== 'boolean') throw new Error(`accepted label is required for ${item.input?.id}`);
    if (!Array.isArray(labels.issue_codes)) throw new Error(`issue_codes must be an array for ${item.input?.id}`);
    const article = byId.get(String(item.input?.id));
    if (!article) throw new Error(`benchmark item ${item.input?.id} is missing from the current corpus`);
    assertSourceUnchanged(item, article);
    assertArticleUnchanged(item, article);
    for (const dimension of WRITING_DIMENSIONS) {
      const score = Number(labels.dimensions?.[dimension]);
      if (!Number.isInteger(score) || score < 1 || score > 5) {
        throw new Error(`${dimension} must be an integer from 1 to 5 for ${item.input?.id}`);
      }
      dimensionTotals[dimension] += score;
    }
    if (!labels.accepted && labels.issue_codes.length === 0) {
      throw new Error(`rejected writing item requires at least one issue code for ${item.input?.id}`);
    }
    if (labels.accepted) accepted += 1;
    if (labels.issue_codes.includes('unsupported_claim')) unsupportedClaimItems += 1;
  }

  const total = packet.items.length;
  const dimensionAverages = Object.fromEntries(
    WRITING_DIMENSIONS.map((name) => [name, ratio(dimensionTotals[name], total)]),
  );
  const result = {
    sample_size: total,
    accepted_count: accepted,
    accepted_rate: ratio(accepted, total),
    unsupported_claim_items: unsupportedClaimItems,
    dimension_averages: dimensionAverages,
    complete: true,
  };
  return {
    ...result,
    pass: result.accepted_rate >= WRITING_ACCEPTANCE_RATE_MIN
      && unsupportedClaimItems === 0
      && Object.values(dimensionAverages).every((average) => average >= WRITING_DIMENSION_AVERAGE_MIN),
  };
}

export function benchmarkMarkdown({ relevance, writing, relevanceReviewer, writingReviewer }) {
  const pct = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;
  return [
    '# Human Content Benchmark Results',
    '',
    `Relevance reviewer: ${relevanceReviewer.id}`,
    `Writing reviewer: ${writingReviewer.id}`,
    '',
    '## Relevance',
    '',
    `- Sample: ${relevance.sample_size}`,
    `- Core precision: ${pct(relevance.core_precision)}`,
    `- Core recall: ${pct(relevance.core_recall)}`,
    `- Core false-positive rate: ${pct(relevance.core_false_positive_rate)}`,
    `- Relevance accuracy: ${pct(relevance.relevance_accuracy)}`,
    `- Route accuracy: ${pct(relevance.route_accuracy)}`,
    `- Category accuracy: ${pct(relevance.category_accuracy)}`,
    `- Human reason-code coverage: ${pct(relevance.human_reason_code_coverage)}`,
    `- Prediction reason-code coverage: ${pct(relevance.prediction_reason_code_coverage)}`,
    `- Generic/consumer items routed core: ${relevance.generic_consumer_core_false_positives}`,
    `- Acceptance gate: ${relevance.pass ? 'PASS' : 'FAIL'}`,
    '',
    '## Writing',
    '',
    `- Sample: ${writing.sample_size}`,
    `- Accepted: ${writing.accepted_count}/${writing.sample_size} (${pct(writing.accepted_rate)})`,
    `- Unsupported-claim items: ${writing.unsupported_claim_items}`,
    ...Object.entries(writing.dimension_averages).map(([name, value]) => `- ${name.replace(/_/g, ' ')}: ${value.toFixed(2)}/5`),
    `- Acceptance gate: ${writing.pass ? 'PASS' : 'FAIL'}`,
    '',
  ].join('\n');
}
