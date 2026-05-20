import { normalizeProperNouns } from './proper-noun-normalizer.mjs';

export const SINGLE_SOURCE_VENDOR_TYPES = new Set([
  'vendor_blog',
  'official_blog',
  'weekly_roundup',
  'product_update',
  'release_notes',
]);

export const SOURCE_SCOPE_PUBLIC_ROUTES = {
  CLOUD_PRODUCT_READ: 'Cloud Product Read',
  ENTERPRISE_PLATFORM_NOTE: 'Enterprise Platform Note',
};

const CAPACITY_EVIDENCE_PATTERNS = [
  /\bnew\s+(?:aws|azure|google cloud|oracle cloud)?\s*(?:cloud\s+)?region\b/i,
  /\bavailability zones?\b/i,
  /\bcloud capacity\b/i,
  /\bcapacity reservations?\b/i,
  /\breserved capacity\b/i,
  /\bcapacity availability\b/i,
  /\bavailable capacity\b/i,
  /\bdata centers?\b/i,
  /\bdatacenters?\b/i,
  /\bcampus\b/i,
  /\bfacilit(?:y|ies)\b/i,
  /\bcolocation\b/i,
  /\bleased capacity\b/i,
  /\bsite readiness\b/i,
  /\bconstruction\b/i,
  /\bpermitting\b/i,
  /\bsiting\b/i,
  /\binterconnection\b/i,
  /\bsubstations?\b/i,
  /\butility milestones?\b/i,
  /\bpower delivery\b/i,
  /\b\d+(?:\.\d+)?\s*(?:mw|megawatts?|gw|gigawatts?)\b/i,
];

export const SCOPE_FORBIDDEN_CLAIMS = [
  ['power_delivery', /\b(power delivery|utility milestones?|substation|interconnection|ppa|grid connection)\b/i],
  ['site_readiness', /\b(site readiness|ready site|campus readiness|facility readiness)\b/i],
  ['supplier_allocation', /\b(supplier allocation|allocated supply|priority allocation|equipment allocation)\b/i],
  ['financing_risk', /\b(financing risk|project finance|funded capacity|debt package|equity commitment)\b/i],
  ['customer_commitments', /\b(customer commitments?|signed customers?|contracted customers?|buyer commitments?)\b/i],
  ['cloud_capacity_availability', /\b(cloud capacity availability|capacity is available|available cloud capacity|reserved capacity)\b/i],
  ['data_center_capacity', /\b(data center capacity|datacenter capacity|leased capacity|colo capacity)\b/i],
  ['capex', /\b(capex|capital expenditure)\b/i],
  ['facility_construction', /\b(facility construction|campus construction|data center build)\b/i],
  ['permitting_or_siting', /\b(permitting|permit approval|siting|zoning)\b/i],
];

function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

export function sourceTextForScope(item = {}) {
  const sourceItems = [
    item.representative_source,
    ...(Array.isArray(item.supporting_sources) ? item.supporting_sources : []),
  ].filter(Boolean);
  const sourceEvidence = [
    item.cleaned_source_text,
    item.source_evidence_text,
    item.rawText,
    item.sourceText,
    ...(item.evidence_pack?.verified_facts || []),
    ...(item.evidence_pack?.facts || []),
  ].filter(Boolean);
  const generatedFallback = sourceEvidence.length ? [] : [
    item.articleText,
    item.contentText,
    item.fullArticleText,
  ];
  return compact([
    item.title,
    item.source,
    item.source_type,
    item.source_domain_adapter,
    item.sourceUrl,
    item.url,
    item.summary,
    item.snippet,
    ...sourceEvidence,
    ...generatedFallback,
    item.primary_category,
    item.category,
    item.infrastructure_layer,
    item.article_type,
    item.evidence_pack?.source_limitations,
    ...(item.evidence_pack?.verified_facts || []),
    ...(item.evidence_pack?.facts || []),
    ...sourceItems.flatMap((source) => [
      source.title,
      source.source_name,
      source.source,
      source.source_url,
      source.url,
      source.cleaned_text,
      source.summary,
      source.snippet,
    ]),
    ...(item.tags || []),
  ].filter(Boolean).join(' '));
}

export function sourceCountForScope(item = {}) {
  const explicit = Number(item.source_count ?? item.evidence_pack?.source_count);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (Array.isArray(item.evidence_pack?.source_links) && item.evidence_pack.source_links.length) {
    return item.evidence_pack.source_links.length;
  }
  if (Array.isArray(item.sources) && item.sources.length) return item.sources.length;
  if (item.representative_source || item.supporting_sources?.length) {
    return 1 + (item.supporting_sources?.length || 0);
  }
  return 1;
}

export function inferSourceType(item = {}) {
  const explicit = compact(item.source_type || item.sourceType || item.source_adapter || item.source_domain_adapter).toLowerCase();
  if (SINGLE_SOURCE_VENDOR_TYPES.has(explicit)) return explicit;

  const text = sourceTextForScope(item).toLowerCase();
  if (/\bweekly roundup\b|\bweek in review\b|\broundup\b/.test(text)) return 'weekly_roundup';
  if (/\brelease notes?\b|\bchangelog\b|\bversion\s+\d/i.test(text)) return 'release_notes';
  if (/\bproduct update\b|\bannounc(?:es|ed|ing)\b|\bintroduc(?:es|ed|ing)\b|\blaunch(?:es|ed|ing)\b|\bgeneral availability\b/.test(text)) {
    return 'product_update';
  }
  if (/\b(blog|newsroom)\b/.test(text) && /\b(aws|amazon|google cloud|microsoft|azure|oracle|cloudflare|nvidia|amd|intel|dell|netapp|veeam|minio)\b/.test(text)) {
    return 'official_blog';
  }
  if (/\b(aws news blog|google cloud blog|microsoft azure blog|nvidia blog|cloudflare blog)\b/.test(text)) return 'official_blog';
  return explicit || 'unknown';
}

export function hasExplicitInfrastructureCapacityEvidence(item = {}) {
  const sourceItems = [
    item.representative_source,
    ...(Array.isArray(item.supporting_sources) ? item.supporting_sources : []),
  ].filter(Boolean);
  const text = compact([
    item.title,
    item.source,
    item.sourceUrl,
    item.url,
    item.cleaned_source_text,
    item.source_evidence_text,
    item.rawText,
    item.sourceText,
    ...(item.evidence_pack?.verified_facts || []),
    ...(item.evidence_pack?.facts || []),
    ...sourceItems.flatMap((source) => [
      source.title,
      source.source_name,
      source.source,
      source.source_url,
      source.url,
      source.cleaned_text,
      source.summary,
      source.snippet,
    ]),
  ].filter(Boolean).join(' '));
  const assertiveText = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\b(does not|doesn't|not|without|no)\b.{0,120}\b(region|availability zone|capacity|data center|datacenter|facility|site|construction|permitting|siting|power|utility|substation|interconnection|customer commitment)\b/i.test(sentence))
    .join(' ');
  return CAPACITY_EVIDENCE_PATTERNS.some((pattern) => pattern.test(assertiveText));
}

export function sourceScopeForbiddenClaimMatches(text = '') {
  const haystack = compact(text);
  return SCOPE_FORBIDDEN_CLAIMS
    .filter(([, pattern]) => pattern.test(haystack))
    .map(([name]) => name);
}

export function isSingleSourceVendorOrProductPost(item = {}) {
  return sourceCountForScope(item) === 1 && SINGLE_SOURCE_VENDOR_TYPES.has(inferSourceType(item));
}

export function sourceScopePolicyResult(item = {}) {
  const source_count = sourceCountForScope(item);
  const source_type = inferSourceType(item);
  const applies = source_count === 1 && SINGLE_SOURCE_VENDOR_TYPES.has(source_type);
  const has_capacity_evidence = hasExplicitInfrastructureCapacityEvidence(item);
  const public_route = source_type === 'weekly_roundup'
    ? SOURCE_SCOPE_PUBLIC_ROUTES.ENTERPRISE_PLATFORM_NOTE
    : SOURCE_SCOPE_PUBLIC_ROUTES.CLOUD_PRODUCT_READ;
  const text = sourceTextForScope(item);
  const forbidden_claims = applies && !has_capacity_evidence
    ? sourceScopeForbiddenClaimMatches(text)
    : [];

  return {
    applies,
    source_count,
    source_type,
    has_explicit_capacity_evidence: has_capacity_evidence,
    public_route,
    public_signal_label: has_capacity_evidence ? undefined : public_route,
    allowed_implication_scopes: applies ? [
      'product implication',
      'platform implication',
      'buyer workflow implication',
      'enterprise architecture implication',
      'technical implementation implication',
    ] : [],
    requires_what_this_does_not_prove: applies && !has_capacity_evidence,
    force_non_core_signal: applies && !has_capacity_evidence,
    force_non_cloud_capacity: applies && !has_capacity_evidence,
    forbidden_claims,
    reasons: applies && !has_capacity_evidence
      ? ['single_source_vendor_product_scope']
      : [],
  };
}

export function scopedPrimaryCategory(article = {}, policy = sourceScopePolicyResult(article)) {
  if (!policy.force_non_cloud_capacity) return article.primary_category || article.category || 'AI Infrastructure';
  return /platform|cloud|aws|azure|google/i.test(sourceTextForScope(article))
    ? 'Enterprise AI Infrastructure'
    : (article.primary_category === 'Cloud Capacity' ? 'AI Infrastructure' : article.primary_category || 'AI Infrastructure');
}

export function applySourceScopePolicy(article = {}, route = {}) {
  const policy = sourceScopePolicyResult(article);
  if (!policy.applies || policy.has_explicit_capacity_evidence) {
    return {
      ...article,
      source_scope_policy: policy,
    };
  }

  const publicRoute = policy.public_route;
  const scopedRoute = {
    score: Number(article.infrastructure_relevance_score ?? route.score ?? article.public_routing?.score ?? 0.68),
    visibility: 'core',
    laneKey: publicRoute === SOURCE_SCOPE_PUBLIC_ROUTES.ENTERPRISE_PLATFORM_NOTE
      ? 'enterprise-platform-notes'
      : 'cloud-product-reads',
    laneTitle: publicRoute,
    public_signal_label: publicRoute,
    editorial_lens: publicRoute,
    story_archetype: publicRoute,
    routing_decision: publicRoute,
    blocked_reasons: policy.reasons,
  };

  return {
    ...article,
    primary_category: scopedPrimaryCategory(article, policy),
    category: scopedPrimaryCategory(article, policy),
    infrastructure_layer: article.infrastructure_layer || 'Enterprise Platform',
    public_route: publicRoute,
    public_signal_label: publicRoute,
    public_routing: scopedRoute,
    routing_decision: scopedRoute.routing_decision,
    source_scope_policy: policy,
    public_presentation: {
      ...(article.public_presentation || {}),
      signal_label: publicRoute,
      editorial_lens: publicRoute,
      lane_key: scopedRoute.laneKey,
      lane_title: scopedRoute.laneTitle,
      visibility: scopedRoute.visibility,
      story_archetype: scopedRoute.story_archetype,
    },
  };
}
