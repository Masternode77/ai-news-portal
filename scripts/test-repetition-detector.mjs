import assert from 'node:assert/strict';
import {
  analyzeArticleRepetition,
  splitByRepetitionGate,
} from './lib/repetition-detector.mjs';

function article(id, body, overrides = {}) {
  return {
    id,
    title: `Article ${id}`,
    publishedAt: overrides.publishedAt || '2026-05-17T00:00:00.000Z',
    article_blueprint: overrides.article_blueprint || 'constraint-ledger',
    articleBlueprint: overrides.articleBlueprint || {
      id: overrides.article_blueprint || 'constraint-ledger',
      sectionHeadings: ['Change', 'Infrastructure Read', 'Exposed Edges', 'Decision Point'],
    },
    expertLensFull: {
      blueprintId: overrides.article_blueprint || 'constraint-ledger',
      finalArticleBody: body,
    },
    ...overrides,
  };
}

const repeatedSentence =
  'The operator said grid equipment availability will determine whether the campus can meet its original delivery window.';
const uniqueDraft = [
  'Change',
  `${repeatedSentence} The report gives buyers a concrete timing issue rather than a broad demand claim.`,
  'Infrastructure Read',
  'Capacity teams should treat the update as a power-delivery signal because the constraint sits outside the server hall.',
  'The practical exposure is schedule credibility, especially where utility upgrades and procurement timelines are not aligned.',
  'Exposed Edges',
  'Developers with secured interconnection positions gain leverage over projects that still need grid studies.',
  'Cloud buyers are exposed if reservation plans assume capacity that cannot be energized on time.',
  'Decision Point',
  'The final test is whether the next disclosure includes energization dates, equipment lead times, and customer commitments.',
].join('\n\n');

const recent = article(
  'recent-1',
  [
    'Report',
    `${repeatedSentence} It also gives investors a clearer way to separate speculative land positions from sites with usable capacity.`,
    'Capital Read',
    'Capital providers are likely to reward projects that can show utility milestones rather than only customer demand.',
    'Operator Read',
    'Operators need tighter coordination between procurement, interconnection, and customer onboarding.',
    'Watch Item',
    'The final test is whether the company can show energization dates and utility-side equipment availability.',
  ].join('\n\n'),
  { publishedAt: '2026-05-16T00:00:00.000Z', article_blueprint: 'capital-operator-brief' }
);

const sentenceMetrics = analyzeArticleRepetition(article('draft-1', uniqueDraft), [recent]);
assert.ok(sentenceMetrics.repeated_sentence_ratio > 0.12);
assert.ok(sentenceMetrics.blocked);
assert.ok(sentenceMetrics.reasons.some((reason) => reason.startsWith('repeated_sentence_ratio')));

const headingMetrics = analyzeArticleRepetition(
  article('draft-2', uniqueDraft),
  [article('recent-2', uniqueDraft, { publishedAt: '2026-05-16T00:00:00.000Z' })]
);
assert.equal(headingMetrics.heading_sequence_similarity, 1);
assert.ok(headingMetrics.reasons.some((reason) => reason.startsWith('heading_sequence_similarity')));

const conclusionA = [
  'Change',
  'A chip supplier described a new deployment schedule for AI servers in enterprise facilities.',
  'Infrastructure Read',
  'The detail matters because networking, power delivery, and facility readiness determine when accelerators become usable capacity.',
  'Exposed Edges',
  'Cloud buyers are exposed when the procurement plan assumes racks can be installed faster than facilities can support them.',
  'Decision Point',
  'The final test is whether buyers receive clear commissioning dates, power availability milestones, and validated operating plans for the next deployment window.',
].join('\n\n');
const conclusionB = [
  'Report',
  'A cloud provider outlined a new schedule for deploying accelerator clusters in several regions.',
  'Capital Read',
  'The update matters because procurement and delivery promises need to match real facility readiness.',
  'Operator Read',
  'Capacity teams will care about whether racks can be powered, cooled, and connected without slipping customer dates.',
  'Watch Item',
  'The final test is whether buyers receive clear commissioning dates, power availability milestones, and validated operating plans for the next deployment window.',
].join('\n\n');
const conclusionMetrics = analyzeArticleRepetition(article('draft-3', conclusionA), [
  article('recent-3', conclusionB, { publishedAt: '2026-05-16T00:00:00.000Z', article_blueprint: 'capital-operator-brief' }),
]);
assert.ok(conclusionMetrics.conclusion_similarity > 0.7);
assert.ok(conclusionMetrics.reasons.some((reason) => reason.startsWith('conclusion_similarity')));

const bannedRecent = Array.from({ length: 9 }, (_, index) =>
  article(
    `recent-banned-${index}`,
    [
      'Report',
      index === 0
        ? 'The financial question is whether customer contracts can support the capital plan.'
        : 'This article uses a different closing frame for infrastructure readers.',
      'Capital Read',
      'The rest of the body avoids the repeated phrase so the window count is explicit.',
    ].join('\n\n'),
    {
      publishedAt: new Date(Date.UTC(2026, 4, 16, 0, 0, 0) - index * 1000).toISOString(),
      article_blueprint: 'capital-operator-brief',
    }
  )
);
const bannedDraft = article(
  'draft-4',
  [
    'Change',
    'The financial question is whether the new capacity plan has enough signed demand behind it.',
    'Infrastructure Read',
    'The operating issue is still specific to the reported source and its delivery schedule.',
    'Exposed Edges',
    'Investors are exposed if financing assumptions move faster than interconnection milestones.',
    'Decision Point',
    'The next disclosure should show whether signed commitments and construction milestones remain aligned.',
  ].join('\n\n')
);
const bannedMetrics = analyzeArticleRepetition(bannedDraft, bannedRecent);
assert.ok(bannedMetrics.banned_phrase_count >= 2);
assert.ok(bannedMetrics.reasons.some((reason) => reason.startsWith('banned_phrase_repeated')));

const { passed, blocked } = splitByRepetitionGate([bannedDraft], bannedRecent);
assert.equal(passed.length, 0);
assert.equal(blocked.length, 1);
assert.equal(blocked[0].articlePagePublished, false);
assert.equal(blocked[0].homepagePublished, false);
assert.equal(blocked[0].archiveOnly, true);

console.log('repetition detector tests passed');
