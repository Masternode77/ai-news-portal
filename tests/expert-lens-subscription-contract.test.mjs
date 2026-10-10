import assert from 'node:assert/strict';
import test from 'node:test';
import { getArticleBlueprint } from '../scripts/lib/article-blueprints.mjs';
import {
  assertCompleteSubscriptionExpertLensPayload,
  buildSubscriptionExpertLensRequest,
} from '../scripts/lib/expert-lens.mjs';
import {
  BRIEF_LABELS,
  NARRATIVE_DNA_REQUIRED_TEXT_FIELDS,
  extractNarrativeDNA,
} from '../scripts/lib/narrative-dna.mjs';

const blueprint = getArticleBlueprint('capacity-chain');
const article = {
  id: 'northline-power-capacity',
  title: 'Northline Power lands 200 MW grid deal',
  source: 'Northline Energy Filing',
  sourceUrl: 'https://example.com/northline/source',
  article_blueprint: blueprint.id,
  category: 'Power & Energy',
  region: 'US',
  summary: 'Northline Power secured 200 MW for a Dakota data center campus, subject to substation delivery.',
  snippet: 'Utility acceptance and construction milestones still control energization.',
  articleText: 'Northline Power secured 200 MW for a Dakota data center campus. The utility must complete the substation before energization in 2027. Utility acceptance remains pending.',
  infrastructure_layer: 'Power & Energy',
  affected_stakeholders: ['Operators', 'Investors'],
  expert_insight: {
    concrete_facts: ['Northline Power secured 200 MW for a Dakota data center campus'],
    named_companies: ['Northline Power'],
    infrastructure_layer: 'Power & Energy',
    bottleneck_type: 'power_grid',
    who_gains_leverage: 'utilities with spare capacity and firm interconnection positions',
    who_takes_execution_risk: 'developers whose delivery dates depend on utility upgrades',
    timing_dependency: 'substation completion and utility acceptance before energization in 2027',
    counterargument: 'the queue position could still slip before the campus receives operating power',
    next_observable_signal: 'substation construction milestones and utility acceptance tests',
    expert_insight_complete: true,
  },
};

const insightParagraph = [
  'Northline Power secured 200 MW for a Dakota data center campus, but power grid delivery remains the capacity-chain constraint.',
  'Power and Energy planning now depends on substation completion and utility acceptance before energization in 2027.',
  'Utilities with spare capacity and firm interconnection positions gain leverage, while developers whose delivery dates depend on utility upgrades carry execution risk.',
  'The queue position could still slip before the campus receives operating power, so the next observable signal is substation construction milestones and utility acceptance tests.',
].join(' ');

function validBody() {
  return [
    'Signal',
    insightParagraph,
    'Capacity Chain',
    `${insightParagraph} The disclosed contract links customer demand to a physical delivery sequence rather than immediate usable capacity.`,
    'Commercial Stakes',
    'Investors and operators therefore have to price schedule exposure separately from contracted demand, while the filing remains the factual boundary for the commercial read.',
    'Next Constraint',
    'The source-bound decision point is whether construction evidence converts the agreement into commissioned capacity, with later filings providing the evidence needed to update delivery assumptions.',
  ].join('\n\n');
}

function validPayload() {
  const narrative = extractNarrativeDNA(article);
  return {
    blueprintId: blueprint.id,
    generation_version: 'editorial_surface_v2',
    narrative_dna: narrative,
    dynamicBriefLabel: narrative.public_signal_label,
    thesis: 'Northline Power depends on utility delivery',
    whatHappened: 'Northline Power secured 200 MW for a Dakota data center campus.',
    whyThisMatters: 'Grid timing now controls when contracted demand can become operating capacity.',
    marketMissing: 'Utility acceptance and substation delivery remain open.',
    investors: 'Investors should track the energization schedule.',
    operators: 'Operators carry commissioning exposure until utility acceptance.',
    hyperscalers: 'Cloud buyers depend on delivered power capacity.',
    watchNext: 'Track substation construction milestones and utility acceptance tests.',
    executiveSummary: ['Northline secured capacity.', 'Grid delivery controls timing.', 'Watch utility acceptance.'],
    headlineOptions: ['Northline secures 200 MW', 'The grid controls Dakota timing', 'Utility work sets the clock', 'Dakota waits on power', 'The substation is the milestone'],
    finalHeadline: 'Northline secures 200 MW as utility work sets the clock',
    metaDescription: 'The Dakota campus depends on substation delivery and utility acceptance.',
    finalArticleBody: validBody(),
    sourceLink: article.sourceUrl,
  };
}

function rejectionReason(payload) {
  try {
    assertCompleteSubscriptionExpertLensPayload(article, payload, blueprint);
  } catch (error) {
    assert.equal(error.code, 'SUBSCRIPTION_EXPERT_LENS_INVALID_PAYLOAD');
    assert.equal(error.message, `Subscription long-form analysis rejected: ${error.reason}`);
    assert.equal(error.message.includes(article.articleText), false);
    return error.reason;
  }
  assert.fail('expected subscription expert-lens payload rejection');
}

test('canonical NarrativeDNA payload and pure provider request share one contract', () => {
  const payload = validPayload();
  assert.doesNotThrow(() => assertCompleteSubscriptionExpertLensPayload(article, payload, blueprint));
  assert.ok(payload.finalArticleBody.length >= blueprint.minChars);
  assert.ok(payload.finalArticleBody.length <= blueprint.maxChars + 400);

  const request = buildSubscriptionExpertLensRequest(article, blueprint);
  const input = JSON.parse(request.userPrompt);
  assert.deepEqual(input.narrativeDNA, extractNarrativeDNA(article));
  assert.equal(input.sourceLink, article.sourceUrl);
  assert.equal(request.maxTokens, 2600);
  for (const field of NARRATIVE_DNA_REQUIRED_TEXT_FIELDS) assert.match(request.systemPrompt, new RegExp(`"${field}"`));
  for (const label of BRIEF_LABELS) assert.match(request.systemPrompt, new RegExp(label));
  assert.match(request.systemPrompt, /sourceLink must be exactly/);
  assert.doesNotMatch(request.systemPrompt, /Use NarrativeDNA before writing:.*antagonist_or_constraint/);
});

test('missing canonical fields fail with bounded, distinct reason codes', () => {
  const complete = validPayload();
  assert.equal(rejectionReason('{not json'), 'payload_not_object');
  assert.equal(rejectionReason({ ...complete, sourceLink: 'https://attacker.example/source' }), 'source_link_mismatch');
  assert.equal(rejectionReason({ ...complete, narrative_dna: { ...complete.narrative_dna, concrete_event: '' } }), 'narrative_dna_text:concrete_event');
  assert.equal(rejectionReason({ ...complete, narrative_dna: { ...complete.narrative_dna, reader_role: 'operators' } }), 'narrative_dna_array:reader_role');
  assert.equal(rejectionReason({ ...complete, dynamicBriefLabel: 'Invalid label' }), 'dynamic_brief_label');
  assert.equal(rejectionReason({ ...complete, executiveSummary: ['one'] }), 'executive_summary_shape');
});

test('capacity-chain length and expert-insight gates retain their exact boundaries', () => {
  const complete = validPayload();
  assert.equal(rejectionReason({ ...complete, finalArticleBody: 'x'.repeat(blueprint.minChars - 1) }), 'body_below_min_chars');
  assert.equal(rejectionReason({ ...complete, finalArticleBody: 'x'.repeat(blueprint.maxChars + 401) }), 'body_above_max_chars');
  const generic = [
    'Signal',
    'A source described a project schedule and a future operating milestone. '.repeat(7),
    'Capacity Chain',
    'Readers can compare the disclosed sequence with later filings and construction evidence. '.repeat(7),
    'Commercial Stakes',
    'The commercial outcome remains conditional on delivery evidence and customer commitments. '.repeat(7),
    'Next Constraint',
    'A later filing should show whether the project moved from planning into commissioned service. '.repeat(7),
  ].join('\n\n');
  assert.ok(generic.length >= blueprint.minChars && generic.length <= blueprint.maxChars + 400);
  assert.equal(rejectionReason({ ...complete, finalArticleBody: generic }), 'body_expert_insight_usage');
});
