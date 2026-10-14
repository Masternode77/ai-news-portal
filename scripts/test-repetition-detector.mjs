import assert from 'node:assert/strict';
import {
  analyzeArticleRepetition,
  LEAD_TEMPLATE_SIMILARITY_THRESHOLD,
  splitByRepetitionGate,
} from './lib/repetition-detector.mjs';
import { BANNED_PHRASES } from './lib/banned-phrases.mjs';

function article(id, body, overrides = {}) {
  return {
    id,
    title: `Article ${id}`,
    publishedAt: overrides.publishedAt || '2026-05-17T00:00:00.000Z',
    articlePagePublished: true,
    archiveOnly: false,
    public_status: 'published',
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
assert.equal(sentenceMetrics.compared_article_count, 1);
assert.equal(sentenceMetrics.repeated_sentence_count, 1);
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
        ? `${BANNED_PHRASES[5]} customer contracts can support the capital plan.`
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
    `${BANNED_PHRASES[5]} the new capacity plan has enough signed demand behind it.`,
    'Infrastructure Read',
    'The operating issue is still specific to the reported source and its delivery schedule.',
    'Exposed Edges',
    'Investors are exposed if financing assumptions move faster than interconnection milestones.',
    'Decision Point',
    'The next disclosure should show whether signed commitments and construction milestones remain aligned.',
  ].join('\n\n')
);
const bannedMetrics = analyzeArticleRepetition(bannedDraft, bannedRecent);
assert.ok(bannedMetrics.banned_phrase_count >= 1);
assert.ok(bannedMetrics.reasons.some((reason) => reason.startsWith('banned_phrase:')));

const { passed, blocked } = splitByRepetitionGate([bannedDraft], bannedRecent);
assert.equal(passed.length, 0);
assert.equal(blocked.length, 1);
assert.equal(blocked[0].articlePagePublished, false);
assert.equal(blocked[0].homepagePublished, false);
assert.equal(blocked[0].archiveOnly, true);

console.log('repetition detector tests passed');

// Lead-template reuse: the same opening construction with other nouns.
const templateLeadA =
  'I track data center capacity the way most people track chip supply or power queues, and the single most underpriced variable in the current buildout cycle is zoning lead time.';
const templateLeadB =
  'I track infrastructure constraints the way most analysts track model benchmarks, and the single most underpriced variable in the current deployment cycle is isolation-layer failure.';
const correctedLead =
  "Zoning lead time is the variable I think the current buildout cycle underprices most, and Amazon's Gilroy project is the reason I keep returning to it.";
const templateRecent = article(
  'recent-5',
  [
    `${templateLeadA} The planning record is where the argument starts.`,
    'The Permit Clock',
    'The application sat with the planning office for two review cycles before anyone outside the city noticed it.',
    'What Settles It',
    'The next docket entry will show whether the approval converts into an energization date or another review cycle.',
  ].join('\n\n'),
  { publishedAt: '2026-05-16T00:00:00.000Z', article_blueprint: 'capital-operator-brief' }
);
const templateDraft = article(
  'draft-5',
  [
    `${templateLeadB} The evaluation report is where the liability question starts.`,
    'The Breakout Record',
    'The model left its test environment during a capability run with the guardrails deliberately switched off.',
    'The Containment Test',
    'The next evaluation report will show whether the containment layer or the model capability moved first.',
  ].join('\n\n')
);
const templateMetrics = analyzeArticleRepetition(templateDraft, [templateRecent]);
assert.ok(templateMetrics.lead_template_similarity > LEAD_TEMPLATE_SIMILARITY_THRESHOLD);
assert.ok(templateMetrics.reasons.some((reason) => reason.startsWith('lead_template_similarity')));
assert.ok(templateMetrics.blocked);

const correctedDraft = article(
  'draft-6',
  [
    `${correctedLead} The comment window closed in 2024 while the application was already four years old.`,
    'The Comment Window',
    'A resident who wanted to raise drought concerns was told the comment period had already lapsed.',
    'What Approval Converts Into',
    'The city record will show whether the approved footprint draws construction crews or another review cycle.',
  ].join('\n\n')
);
const correctedMetrics = analyzeArticleRepetition(correctedDraft, [templateRecent]);
assert.ok(correctedMetrics.lead_template_similarity <= LEAD_TEMPLATE_SIMILARITY_THRESHOLD);
assert.ok(!correctedMetrics.reasons.some((reason) => reason.startsWith('lead_template_similarity')));
assert.equal(correctedMetrics.blocked, false);

console.log('lead template repetition tests passed');
