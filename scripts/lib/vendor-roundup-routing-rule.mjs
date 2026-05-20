import {
  applySourceScopePolicy,
  hasExplicitInfrastructureCapacityEvidence,
  isSingleSourceVendorOrProductPost,
  sourceScopeForbiddenClaimMatches,
  sourceScopePolicyResult,
} from './source-scope-policy.mjs';

function publicText(article = {}) {
  return [
    article.title,
    article.deck,
    article.summary,
    article.snippet,
    article.why_it_matters,
    article.article_body_markdown,
    article.articleText,
    article.contentText,
    article.fullArticleText,
    article.bottom_line,
  ].filter(Boolean).join('\n\n');
}

export function vendorRoundupRoutingDecision(article = {}) {
  const policy = sourceScopePolicyResult(article);
  const scoped = applySourceScopePolicy(article, article.public_routing || {});
  const text = publicText(scoped);
  const assertiveText = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\b(does not prove|not evidence of|not proof of|without proving|cannot prove)\b/i.test(sentence))
    .join(' ');
  const forbidden = policy.force_non_core_signal
    ? sourceScopeForbiddenClaimMatches(assertiveText)
    : [];
  const reasons = [];

  if (policy.force_non_core_signal && (article.public_signal_label === 'Core Signal' || article.public_route === 'Core Longform Blog')) {
    reasons.push('vendor_roundup_core_signal_without_capacity_evidence');
  }
  if (policy.force_non_cloud_capacity && (article.primary_category === 'Cloud Capacity' || article.category === 'Cloud Capacity')) {
    reasons.push('vendor_roundup_cloud_capacity_without_capacity_evidence');
  }
  for (const claim of forbidden) reasons.push(`vendor_roundup_unsupported_${claim}`);
  if (policy.requires_what_this_does_not_prove && !/\bwhat this does not prove\b|\bdoes not prove\b|\bnot evidence of\b/i.test(text)) {
    reasons.push('vendor_roundup_missing_limitation');
  }

  return {
    applies: isSingleSourceVendorOrProductPost(article),
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    has_explicit_capacity_evidence: hasExplicitInfrastructureCapacityEvidence(article),
    policy,
    scoped,
  };
}

export function applyVendorRoundupRoutingRule(article = {}) {
  const decision = vendorRoundupRoutingDecision(article);
  if (!decision.applies) {
    return {
      ...article,
      vendor_roundup_routing_rule: decision,
    };
  }
  return {
    ...decision.scoped,
    vendor_roundup_routing_rule: decision,
  };
}
