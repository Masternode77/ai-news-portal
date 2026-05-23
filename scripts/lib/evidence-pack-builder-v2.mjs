import {
  compact,
  extractCompanies,
  extractNumericClaims,
  extractRegions,
  inferInfrastructureLayer,
  sentence,
  verifiedFactSentences,
} from './autonomous-desk-utils.mjs';

function stakeholderSet(layer = '') {
  if (/power|grid/i.test(layer)) return ['utilities', 'data center operators', 'capacity planners', 'infrastructure investors'];
  if (/capital|reit|finance/i.test(layer)) return ['infrastructure investors', 'developers', 'lenders', 'hyperscale buyers'];
  if (/semiconductor|memory|accelerator|network/i.test(layer)) return ['server OEMs', 'cloud capacity teams', 'semiconductor suppliers', 'enterprise buyers'];
  if (/platform|storage/i.test(layer)) return ['platform teams', 'enterprise infrastructure buyers', 'operators', 'resilience teams'];
  return ['operators', 'capacity planners', 'cloud buyers', 'infrastructure investors'];
}

export function buildEvidencePackV2(cluster = {}, claimLedger = []) {
  const representative = cluster.representative_source || {};
  const sourceItems = [representative, ...(cluster.supporting_sources || [])].filter(Boolean);
  const sourceText = sourceItems.map((item) => [item.title, item.cleaned_text].join(' ')).join(' ');
  const layer = cluster.primary_infrastructure_layer || inferInfrastructureLayer(sourceText);
  const companies = cluster.companies?.length ? cluster.companies : extractCompanies(sourceText);
  const regions = cluster.regions?.length ? cluster.regions : extractRegions(sourceText);
  const facts = [
    ...(cluster.extracted_facts || []),
    ...sourceItems.flatMap((item) => verifiedFactSentences(item, 4)),
  ];
  const uniqueFacts = [...new Set(facts.map(sentence).filter(Boolean))].slice(0, 8);
  const numeric = claimLedger.filter((claim) => claim.numeric_value !== null && claim.numeric_value !== undefined);
  const actors = companies.slice(0, 4);
  const controlPoint = layer || 'AI infrastructure';

  return {
    verified_facts: uniqueFacts,
    numeric_claims: numeric.length ? numeric : extractNumericClaims(sourceText),
    named_entities: actors,
    infrastructure_layer: controlPoint,
    affected_stakeholders: stakeholderSet(controlPoint),
    commercial_implications: [
      `Buyers have to decide whether ${controlPoint} availability changes procurement timing or supplier leverage.`,
      `Investors should separate demand signals from delivery risk before capitalizing the headline.`,
    ],
    operating_implications: [
      `Operators should map the signal to site readiness, power delivery, platform resilience, or supplier allocation before changing plans.`,
      `The operating value depends on whether the named actors can turn the announcement into measurable capacity or lower execution risk.`,
    ],
    capital_market_implications: /capital|reit|finance|debt|equity|ipo|lease/i.test(sourceText)
      ? ['The signal affects how public and private capital underwrite AI infrastructure exposure.']
      : [],
    policy_or_siting_implications: /permit|siting|zoning|moratorium|regulation|county|grid/i.test(sourceText)
      ? ['Local permitting, grid rules, or utility calendars can become the controlling constraint.']
      : [],
    counterarguments: [
      'The source evidence may describe intent or market pressure without proving that capacity, cost, or delivery risk has changed yet.',
      'A single announcement can shift negotiating leverage without immediately adding usable infrastructure.',
    ],
    uncertainty: [
      'Customer commitments, delivery dates, utility milestones, and cost exposure may still be incomplete.',
    ],
    what_would_change_our_view: [
      'named customer commitments',
      'firm delivery or interconnection dates',
      'measurable cost, capacity, or reliability changes',
    ],
    watch_metrics: [
      /power|grid/i.test(controlPoint) ? 'interconnection queue movement and utility tariff exposure' : 'delivery timing and customer commitment quality',
      /capital|reit|finance/i.test(controlPoint) ? 'lease terms, debt cost, and funded capacity milestones' : 'site readiness and supplier allocation',
      /memory|semiconductor|accelerator/i.test(controlPoint) ? 'HBM, GPU, and server allocation signals' : 'operating cost variance and service availability',
    ],
    source_limitations: sourceItems.length > 1
      ? 'The cluster has more than one source, but the article still treats unverified details as open questions.'
      : 'The cluster is single-source, so the analysis avoids claims that require outside confirmation.',
    source_links: sourceItems.map((item) => ({ name: item.source_name || item.source, url: item.source_url || item.url })).filter((item) => item.url),
    why_now: cluster.last_seen_at || representative.source_published_at || new Date().toISOString(),
    regions,
  };
}
