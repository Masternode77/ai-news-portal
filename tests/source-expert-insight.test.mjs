import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveEnrichmentExpertInsight,
  sourceGroundedInsightRequired,
} from '../scripts/lib/content.mjs';
import {
  expertInsightUsageScore,
  validateSourceExpertInsight,
} from '../scripts/lib/expert-insight-engine.mjs';

const DOE_SENTENCES = [
  'The U.S. Department of Energy supported the Federal Energy Regulatory Commission call for PJM Interconnection LLC to file a tariff that protects ratepayers as data center demand grows.',
  'The filing would establish rules for allocating transmission and generation costs created by co-located data center loads rather than shifting those costs to other customers.',
  'PJM Interconnection LLC said its region has more than 15 GW of data center requests under study and that procurement rules must distinguish committed load from speculative requests.',
  'The Department said tariff milestones and transparent procurement commitments should be the next observable checkpoints before new load receives firm service.',
  'The proposal does not guarantee lower bills because the commission must still review the filing and decide whether the allocation method is just and reasonable.',
  'The release carried the heading Build More Reliable Power while ERCOT and Northstar Compute Labs evaluated similar tariff questions.',
  'GridWorks CEO Alex Rivera said the company would publish its own procurement evidence.',
  'Crusoe announced a separate review while Nebius said it would publish supporting data.',
];
const DOE_SOURCE = DOE_SENTENCES.join(' ');

function groundedPayload() {
  const sourceEvidence = {
    concrete_facts: [DOE_SENTENCES[0], DOE_SENTENCES[2]],
    named_actors: [DOE_SENTENCES[0], DOE_SENTENCES[2]],
    infrastructure_layer: [DOE_SENTENCES[1]],
    bottleneck_type: [DOE_SENTENCES[1]],
    who_gains_leverage: [DOE_SENTENCES[1]],
    who_takes_execution_risk: [DOE_SENTENCES[1]],
    timing_dependency: [DOE_SENTENCES[2], DOE_SENTENCES[3]],
    counterargument: [DOE_SENTENCES[4]],
    next_observable_signal: [DOE_SENTENCES[3]],
  };
  return {
    concrete_facts: [DOE_SENTENCES[0], DOE_SENTENCES[2]],
    named_actors: ['U.S. Department of Energy', 'Federal Energy Regulatory Commission', 'PJM Interconnection LLC'],
    infrastructure_layer: 'Power',
    bottleneck_type: 'tariff_cost_allocation',
    who_gains_leverage: 'ratepayers and customers with transparent cost allocation gain leverage in the tariff review',
    who_takes_execution_risk: 'co-located data center customers carry the risk that incremental system costs are assigned to their load',
    timing_dependency: 'PJM procurement commitments and tariff milestones must distinguish firm demand from speculative requests',
    counterargument: 'the proposal does not guarantee lower bills because the commission must still review the allocation method',
    next_observable_signal: 'the next checkpoint is PJM tariff milestones and transparent procurement commitments for firm service',
    source_evidence: sourceEvidence,
  };
}

function reasonFor(payload, source = DOE_SOURCE) {
  try {
    validateSourceExpertInsight(payload, source);
  } catch (error) {
    assert.equal(error.code, 'SOURCE_EXPERT_INSIGHT_INVALID');
    assert.equal(error.message, `Source-grounded expert insight rejected: ${error.reason}`);
    assert.equal(error.message.includes(DOE_SOURCE), false);
    return error.reason;
  }
  assert.fail('expected source expert insight rejection');
}

test('DOE-like source insight keeps institutional actors and source-specific tariff constraints', () => {
  const insight = validateSourceExpertInsight(groundedPayload(), DOE_SOURCE);
  assert.deepEqual(insight.named_companies, [
    'U.S. Department of Energy',
    'Federal Energy Regulatory Commission',
    'PJM Interconnection LLC',
  ]);
  assert.equal(insight.bottleneck_type, 'tariff_cost_allocation');
  assert.match(insight.timing_dependency, /procurement commitments and tariff milestones/);
  assert.doesNotMatch(Object.values(insight).flat().join(' '), /generic interconnection|substation equipment/i);
  assert.equal(insight.expert_insight_complete, true);
  assert.equal(insight.source_grounded, true);
  assert.deepEqual(insight.source_evidence.named_actors, [DOE_SENTENCES[0], DOE_SENTENCES[2]]);
});

test('source insight rejects fabricated evidence, headline fragments, and unsupported numbers', () => {
  const fabricatedEvidence = groundedPayload();
  fabricatedEvidence.source_evidence.counterargument = ['The commission approved the tariff without conditions.'];
  assert.equal(reasonFor(fabricatedEvidence), 'unsupported_evidence:counterargument');

  const falseActor = groundedPayload();
  falseActor.named_actors = ['Build More Reliable Power'];
  falseActor.source_evidence.named_actors = [DOE_SENTENCES[5]];
  assert.equal(reasonFor(falseActor), 'named_actors');

  const partialActor = groundedPayload();
  partialActor.named_actors = ['Federal Energy'];
  partialActor.source_evidence.named_actors = [DOE_SENTENCES[0]];
  assert.equal(reasonFor(partialActor), 'named_actors');

  const unsupportedNumber = groundedPayload();
  unsupportedNumber.who_gains_leverage = 'PJM Interconnection LLC gains leverage over $99 billion in tariff costs';
  assert.equal(reasonFor(unsupportedNumber), 'unsupported_numeric:who_gains_leverage');

  const malformedActor = groundedPayload();
  malformedActor.named_actors = [42];
  assert.equal(reasonFor(malformedActor), 'named_actors');
  const malformedScalar = groundedPayload();
  malformedScalar.counterargument = { text: 'not a string' };
  assert.equal(reasonFor(malformedScalar), 'text_field:counterargument');
  const malformedEvidence = groundedPayload();
  malformedEvidence.source_evidence.timing_dependency = [42];
  assert.equal(reasonFor(malformedEvidence), 'evidence_shape:timing_dependency');
});

test('actor boundaries accept standalone acronyms, unknown institutions, and company-adjacent roles', () => {
  for (const [actor, evidence] of [
    ['ERCOT', DOE_SENTENCES[5]],
    ['Northstar Compute Labs', DOE_SENTENCES[5]],
    ['GridWorks', DOE_SENTENCES[6]],
    ['Crusoe', DOE_SENTENCES[7]],
    ['Nebius', DOE_SENTENCES[7]],
  ]) {
    const payload = groundedPayload();
    payload.named_actors = [actor];
    payload.source_evidence.named_actors = [evidence];
    const insight = validateSourceExpertInsight(payload, DOE_SOURCE);
    assert.deepEqual(insight.named_companies, [actor]);
  }
});

test('source insight fails closed for null or insufficient input without invented data', () => {
  assert.equal(reasonFor(null), 'payload_not_object');
  assert.equal(reasonFor(groundedPayload(), 'Short source.'), 'source_text_insufficient');
});

test('only extraction-qualified full memos require grounded insight in the live path', () => {
  const qualified = {
    liveSubscription: true,
    extractionQa: { can_generate_longform: true, extraction_quality_score: 0.95 },
    infrastructureRelevance: { infrastructure_relevance_tier: 'full_memo' },
  };
  assert.equal(sourceGroundedInsightRequired(qualified), true);
  assert.equal(sourceGroundedInsightRequired({ ...qualified, extractionQa: { ...qualified.extractionQa, extraction_quality_score: 0.79 } }), false);
  assert.equal(sourceGroundedInsightRequired({ ...qualified, infrastructureRelevance: { infrastructure_relevance_tier: 'archive_only' } }), false);
  assert.equal(resolveEnrichmentExpertInsight({
    ...qualified,
    sourceExpertInsightProvided: true,
    sourceExpertInsight: groundedPayload(),
    sourceText: DOE_SOURCE,
  }).source_grounded, true);
  const weak = resolveEnrichmentExpertInsight({
    ...qualified,
    infrastructureRelevance: { infrastructure_relevance_tier: 'archive_only' },
    sourceExpertInsight: null,
    sourceText: '',
  });
  assert.equal(weak.expert_insight_complete, false);
  assert.deepEqual(weak.concrete_facts, []);
  assert.deepEqual(weak.named_companies, []);

  const abstained = resolveEnrichmentExpertInsight({
    ...qualified,
    sourceExpertInsightProvided: true,
    sourceExpertInsight: null,
    sourceText: DOE_SOURCE,
  });
  assert.equal(abstained.expert_insight_complete, false);
  assert.equal(abstained.source_grounded_abstention, true);
  assert.throws(() => resolveEnrichmentExpertInsight({
    ...qualified,
    sourceExpertInsightProvided: false,
    sourceText: DOE_SOURCE,
  }), (error) => error.code === 'SOURCE_EXPERT_INSIGHT_INVALID' && error.reason === 'source_expert_insight_missing');
  assert.throws(() => resolveEnrichmentExpertInsight({
    ...qualified,
    sourceExpertInsightProvided: true,
    sourceExpertInsight: false,
    sourceText: DOE_SOURCE,
  }), (error) => error.code === 'SOURCE_EXPERT_INSIGHT_INVALID' && error.reason === 'payload_not_object');
});

test('retained DOE response uses source-grounded insight without literal sentence-prefix copying', () => {
  const insight = {
    concrete_facts: [
      'DOE filed a Notice of Intervention and Statement of Position with FERC supporting its recommendation for PJM’s proposed Reliability Backstop Procurement.',
      'FERC recommends PJM submit revised tariff provisions to implement appropriate cost allocation and other reforms.',
    ],
    named_companies: ['U.S. Department of Energy', 'Federal Energy Regulatory Commission', 'PJM Interconnection LLC'],
    infrastructure_layer: 'Power',
    bottleneck_type: 'The article identifies warning signs of generation capacity shortfalls and a dispute over allocating the cost of supply needed for large electricity users; it does not quantify the capacity gap.',
    who_gains_leverage: 'Existing customers could gain protection against cost transfers if the proposed allocation reforms are implemented; this is the administration’s stated objective, not a demonstrated outcome.',
    who_takes_execution_risk: 'PJM faces responsibility for translating FERC’s recommendations into revised tariffs. Large electricity users could bear greater funding responsibility for the generation and infrastructure serving them.',
    timing_dependency: 'Implementation depends on PJM submitting revised tariff provisions. DOE urges prompt compliance, but the article provides no specific submission deadline.',
    counterargument: 'Support for the reforms does not establish that they will lower electricity costs or deliver sufficient generation: the article describes proposed procurement and a request to accelerate development, without reporting delivery results.',
    next_observable_signal: 'The next observable step would be PJM submitting revised tariff provisions addressing cost allocation and other reforms recommended by FERC.',
    source_grounded: true,
  };
  const body = [
    'Signal',
    'Large electricity users in PJM could face greater responsibility for financing the power supply that serves them. On October 9, 2026, the U.S. Department of Energy announced support for FERC’s call for tariff reforms aimed at protecting existing customers from those costs.',
    'Capacity Chain',
    'DOE filed a Notice of Intervention and Statement of Position supporting FERC’s recommendations for PJM Interconnection LLC’s proposed Reliability Backstop Procurement. FERC recommends revised tariff provisions covering cost allocation and other reforms. PJM must translate that direction into rules governing who pays.',
    'The pressure follows the administration’s January 2026 call for an emergency power auction and faster development of reliable generation, joined by governors from all 13 PJM states. DOE cites early warnings of capacity shortfalls but does not quantify the gap. Funding responsibility and sufficient supply are linked problems; resolving one does not resolve both.',
    'The intended chain runs from revised market rules to procurement and generation development. DOE urges prompt compliance, but gives no tariff submission deadline or generation delivery schedule. Its announcement reports neither auction results nor completed capacity, leaving the timing of additional supply unresolved.',
    'Commercial Stakes',
    'Large users evaluating demand in PJM therefore face a potential funding obligation alongside their need for electricity. The tariff details will matter to project budgets and procurement decisions. Existing customers could gain protection against cost transfers, but that remains the administration’s stated objective, rather than a demonstrated saving.',
    'Next Constraint',
    'DOE’s support does not establish that the proposed procurement will deliver enough generation or lower bills. Its account describes a regulatory step and a push to accelerate development, with no delivery results to test those claims.',
    'Watch for PJM’s revised tariff filing: how it assigns costs, which users bear them and how the provisions would take effect. That would clarify funding responsibilities; evidence of procurement and generation delivery would then show whether the reforms are adding reliable supply.',
  ].join('\n\n');
  assert.ok(expertInsightUsageScore(body, insight) >= 0.55);

  const keywordList = 'PJM Power cost allocation tariffs implementation customers risk timing reforms signal.';
  assert.ok(expertInsightUsageScore(keywordList, insight) < 0.55);
  const contradicted = [
    insight.concrete_facts[0],
    'PJM Interconnection LLC operates in the Power layer.',
    'PJM does not face responsibility for revised tariffs or funding risk.',
    'Existing customers do not gain protection from allocation reforms.',
    'There is no timing dependency and no next tariff filing to observe.',
  ].join(' ');
  assert.ok(expertInsightUsageScore(contradicted, insight) < 0.55);
});

test('source-grounded usage requires compatible polarity in each matching sentence', () => {
  const negativeClaim = 'PJM does not establish lower costs without delivered generation evidence';
  const insight = {
    concrete_facts: [negativeClaim],
    named_companies: ['PJM Interconnection LLC'],
    infrastructure_layer: 'Power',
    bottleneck_type: negativeClaim,
    who_gains_leverage: negativeClaim,
    who_takes_execution_risk: negativeClaim,
    timing_dependency: negativeClaim,
    counterargument: negativeClaim,
    next_observable_signal: negativeClaim,
    source_grounded: true,
  };
  const positiveInverse = [
    'PJM Interconnection LLC operates in the Power layer.',
    'PJM establishes lower costs with delivered generation evidence.',
  ].join(' ');

  assert.ok(expertInsightUsageScore(positiveInverse, insight) < 0.55);
});

test('source-grounded usage requires numeric support in the same semantic unit', () => {
  const numericClaim = 'PJM assigns 15 GW of tariff costs to large electricity users';
  const insight = {
    concrete_facts: [numericClaim],
    named_companies: ['PJM Interconnection LLC'],
    infrastructure_layer: 'Power',
    bottleneck_type: numericClaim,
    who_gains_leverage: numericClaim,
    who_takes_execution_risk: numericClaim,
    timing_dependency: numericClaim,
    counterargument: numericClaim,
    next_observable_signal: numericClaim,
    source_grounded: true,
  };
  const splitSupport = [
    'PJM Interconnection LLC operates in the Power layer.',
    'A separate interconnection queue contains 15 GW of proposed projects.',
    'PJM assigns tariff costs to large electricity users.',
  ].join(' ');

  assert.ok(expertInsightUsageScore(splitSupport, insight) < 0.55);
});
