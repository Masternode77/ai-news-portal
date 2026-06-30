const GENERIC_AI_INFRASTRUCTURE_FALLBACK_PATTERNS = [
  /\bremains a source-linked AI infrastructure signal\b/gi,
  /\bsource-linked AI infrastructure signal\b/gi,
  /\bAI infrastructure\b/gi,
  /\bCompute\b/gi,
  /\bAI infrastructure delivery risk\b/gi,
  /\bAI Infrastructure GPU clusters and deployment readiness\b/gi,
  /\bCompute Partnership\b/gi,
];

const SOURCE_BACKED_INFRASTRUCTURE_PATTERNS = [
  /\bdata centers?\b/i,
  /\bdatacenters?\b/i,
  /\bcolo(?:cation)?\b/i,
  /\bhyperscale\b/i,
  /\bAI campus\b/i,
  /\bcampus energization\b/i,
  /\bfacilit(?:y|ies)\b/i,
  /\bgrid\b/i,
  /\bpower\b/i,
  /\butility\b/i,
  /\binterconnection\b/i,
  /\bsubstation\b/i,
  /\btransmission\b/i,
  /\benergization\b/i,
  /\bcommissioning\b/i,
  /\bPPA\b/i,
  /\b(?:MW|GW)\b/,
  /\bcooling\b/i,
  /\bliquid cooling\b/i,
  /\bthermal\b/i,
  /\brack(?:s| density| planning)?\b/i,
  /\bGPU(?:s)?\b/i,
  /\baccelerator(?:s)?\b/i,
  /\bsemiconductor(?:s)?\b/i,
  /\bchip(?:s)?\b/i,
  /\bHBM\b/i,
  /\bmemory bandwidth\b/i,
  /\bcloud capacity\b/i,
  /\bcloud region\b/i,
  /\bavailability zone\b/i,
  /\bAWS\b/i,
  /\bAzure\b/i,
  /\bGoogle Cloud\b/i,
  /\bOpenShift\b/i,
  /\bKubernetes\b/i,
  /\bstorage\b/i,
  /\bbackup\b/i,
  /\bdisaster recovery\b/i,
  /\binference capacity\b/i,
  /\bplatform infrastructure\b/i,
  /\bproject finance\b/i,
  /\binfrastructure fund\b/i,
  /\bdata center (?:capital|financing|lease|acquisition|construction)\b/i,
  /\b(?:capital|financing|lease|acquisition|construction)\b.{0,80}\bdata center\b/i,
  /\btransformer(?:s)?\b/i,
  /\bsupply chain\b/i,
  /\bequipment backlog\b/i,
];

function stripGenericFallbackText(value = '') {
  return GENERIC_AI_INFRASTRUCTURE_FALLBACK_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, ' '),
    String(value || ''),
  );
}

function sourceBackedProductFitText(article = {}) {
  return [
    article.title,
    article.summary,
    article.snippet,
    article.deck,
    article.why_it_matters,
    article.primary_category,
    article.category,
    article.infrastructure_layer,
    article.articleText,
    article.contentText,
    article.fullArticleText,
    article.cleaned_source_text,
    article.source_evidence_text,
    article.rawText,
    ...(Array.isArray(article.extracted_facts) ? article.extracted_facts : []),
    ...(Array.isArray(article.evidence_pack?.facts) ? article.evidence_pack.facts : []),
    ...(Array.isArray(article.evidence_pack?.verified_facts) ? article.evidence_pack.verified_facts : []),
    article.evidence_pack?.operatingImplication,
  ].filter(Boolean).map(stripGenericFallbackText).join(' ');
}

export function hasSourceBackedCardProductFit(article = {}) {
  const text = sourceBackedProductFitText(article);
  return SOURCE_BACKED_INFRASTRUCTURE_PATTERNS.some((pattern) => pattern.test(text));
}
