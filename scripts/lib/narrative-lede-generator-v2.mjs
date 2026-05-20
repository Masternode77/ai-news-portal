import { compact, sentence } from './autonomous-desk-utils.mjs';

const OPENING_MOVES = [
  ({ actor, layer, control }) => `${actor} turns this signal into a test of who can control ${layer} when ${control} becomes scarce`,
  ({ actor, layer, control }) => `The important part of ${actor}'s latest signal is not the headline size, but the ${control} it exposes inside ${layer}`,
  ({ actor, layer, control }) => `For AI infrastructure teams, ${actor} now sits at the point where ${layer} plans meet ${control}`,
  ({ actor, layer, control }) => `${actor} gives the market a cleaner way to see ${layer}: follow ${control}, not the loudest capacity claim`,
  ({ actor, layer, control }) => `The new signal around ${actor} is a reminder that ${layer} strategy is won or lost at the ${control} layer`,
];

function sourceAnchor(fact = '') {
  return compact(fact)
    .replace(/^The source item centers on\s+/i, '')
    .replace(/\.$/, '');
}

export function generateNarrativeLedeV2({ cluster = {}, evidencePack = {}, thesis = {}, index = 0 } = {}) {
  const actor = evidencePack.named_entities?.[0] || cluster.companies?.[0] || cluster.representative_source?.source_name || 'This signal';
  const layer = evidencePack.infrastructure_layer || cluster.primary_infrastructure_layer || 'AI infrastructure';
  const control = thesis.bottleneck_or_control_point || 'execution control';
  const fact = evidencePack.verified_facts?.[0] || thesis.what_changed || cluster.cluster_title || '';
  const second = evidencePack.verified_facts?.[1] || thesis.why_it_matters_for_ai_infrastructure || '';
  return [
    sentence(OPENING_MOVES[index % OPENING_MOVES.length]({ actor: compact(actor), layer: compact(layer), control: compact(control) })),
    sentence(`${sourceAnchor(fact)} gives the analysis a concrete event to test against delivery, cost, and operating evidence`),
    sentence(`${sourceAnchor(second)} matters when it changes what operators, buyers, or investors can verify now rather than what they hope will happen later`),
  ].join('\n\n');
}
