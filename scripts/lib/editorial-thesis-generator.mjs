import { compact, sentence } from './autonomous-desk-utils.mjs';

export function generateEditorialThesis(cluster = {}, evidencePack = {}) {
  const actor = evidencePack.named_entities?.[0] || cluster.companies?.[0] || cluster.representative_source?.source_name || 'The market';
  const layer = evidencePack.infrastructure_layer || cluster.primary_infrastructure_layer || 'AI infrastructure';
  const fact = evidencePack.verified_facts?.[0] || cluster.cluster_title || 'a new infrastructure signal';
  const controlPoint = /power|grid/i.test(layer)
    ? 'time-to-power'
    : /capital|reit|finance/i.test(layer)
      ? 'capital conversion'
      : /semiconductor|memory|accelerator/i.test(layer)
        ? 'supply allocation'
        : /platform|storage|cloud/i.test(layer)
          ? 'platform readiness'
          : 'execution control';
  return {
    thesis_sentence: sentence(`${actor} matters here because ${controlPoint} now sits between AI demand and usable ${layer}`),
    why_now: sentence(`${fact.replace(/\.$/, '')} gives readers a current event to test against procurement, delivery, and operating calendars`),
    what_changed: sentence(fact),
    why_it_matters_for_ai_infrastructure: sentence(`The signal changes who controls ${layer}, who waits on scarce inputs, and which assumptions need verification before capacity plans move`),
    who_benefits: sentence(`${actor} and counterparties with committed supply, site readiness, or financing gain leverage if the milestones hold`),
    who_is_exposed: sentence(`Buyers and investors are exposed if the announcement outruns power delivery, supplier allocation, customer commitments, or local approvals`),
    decision_relevance: sentence(`Readers should use it to update diligence checklists, not to assume capacity is already available`),
    bottleneck_or_control_point: controlPoint,
    counterargument: evidencePack.counterarguments?.[0] || 'The reported signal may not yet change capacity, cost, or execution risk.',
    bottom_line: sentence(`${actor} becomes a stronger infrastructure signal only if the next observable milestones confirm ${controlPoint}`),
  };
}
