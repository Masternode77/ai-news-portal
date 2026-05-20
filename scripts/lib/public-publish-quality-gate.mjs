import { antiTemplateGuardV2 } from './anti-template-guard-v2.mjs';
import { detectBoilerplate } from './boilerplate-detector.mjs';
import { cleanArticleBodyBlocks } from './article-body-cleaner.mjs';
import {
  duplicateFirstWordPrefixes,
  forbiddenPublicPhraseMatches,
  guardPublicCopy,
} from './copy-quality-guard.mjs';
import { humanStyleScore } from './human-style-score.mjs';
import { malformedProperNouns } from './proper-noun-normalizer.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import {
  applySourceScopePolicy,
  hasExplicitInfrastructureCapacityEvidence,
  sourceScopeForbiddenClaimMatches,
  sourceScopePolicyResult,
} from './source-scope-policy.mjs';
import { sourceSummaryRatio } from './source-summary-ratio.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';
import { headingSequence, paragraphCount, wordCount } from './visible-body-length.mjs';

export const PUBLIC_INTERNAL_LABELS = [
  'Backfilled Analysis',
  'Evidence',
  'Verification frame',
  'Verified facts',
  'Key numbers',
  'Source count',
  'Unsupported claims',
  'Claim verification',
  'claim ledger',
];

const BOILERPLATE_PATTERNS = [
  /\bthe source item centers on\b/i,
  /\bgives the analysis a concrete event\b/i,
  /\bmoves the item into Compute Current's infrastructure lane\b/i,
  /\bis the evidence anchor for this section\b/i,
  /\bThe signal changes who controls\b/i,
  /\bcontrol point in this story\b/i,
  /\bThe cluster clears the desk bar\b/i,
  /\bWhy the desk selected it\b/i,
  /\bthe desk selected it\b/i,
  /\bnarrative momentum\b/i,
  /\bevidence reaches the operating layer\b/i,
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function publicBody(article = {}) {
  return String(
    article.article_body_markdown
    || article.expertLensFull?.finalArticleBody
    || article.fullArticleText
    || article.contentText
    || article.articleText
    || ''
  ).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function publicText(article = {}) {
  return [
    article.title,
    article.deck,
    article.summary,
    article.snippet,
    article.why_it_matters,
    article.expertLensShort,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    publicBody(article),
    article.bottom_line,
    article.expertLensFull?.bottomLine,
    ...(article.at_a_glance || article.expertLensFull?.atAGlance || []),
    ...(article.what_to_watch || article.expertLensFull?.watchMetrics || []),
  ].filter(Boolean).join('\n\n');
}

function sourceText(article = {}) {
  return compact([
    article.cleaned_source_text,
    article.source_evidence_text,
    article.rawText,
    article.sourceText,
    ...(article.evidence_pack?.verified_facts || []),
    ...(article.evidence_pack?.facts || []),
  ].filter(Boolean).join(' '));
}

function exactLabelLeaks(text = '') {
  return PUBLIC_INTERNAL_LABELS.filter((label) => {
    const pattern = new RegExp(`(^|[^A-Za-z0-9])${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, label === 'claim ledger' ? 'i' : '');
    return pattern.test(text);
  });
}

function repeatedHeadingSequence(article = {}, recent = []) {
  const current = headingSequence(publicBody(article)).join(' > ');
  if (!current) return false;
  return recent
    .map((item) => headingSequence(publicBody(item)).join(' > '))
    .filter(Boolean)
    .filter((sequence) => sequence === current)
    .length >= 2;
}

function hasLimitation(article = {}) {
  const text = publicText(article);
  return /\bwhat this does not prove\b|\bdoes not prove\b|\blimitation\b|\bthe open question\b|\bstill leaves\b|\bnot evidence of\b/i.test(text);
}

function hasBottomLine(article = {}) {
  return Boolean(compact(article.bottom_line || article.expertLensFull?.bottomLine))
    || /\bbottom line\b/i.test(publicBody(article));
}

function routeMismatchReasons(article = {}) {
  const strict = routePublicLane(article);
  const current = article.public_routing || {};
  const reasons = [];
  if (current.routing_decision && strict.routing_decision && current.routing_decision !== strict.routing_decision) {
    reasons.push(`public_route_mismatch:${current.routing_decision}->${strict.routing_decision}`);
  }
  if (current.public_signal_label && strict.public_signal_label && current.public_signal_label !== strict.public_signal_label) {
    reasons.push(`public_signal_label_mismatch:${current.public_signal_label}->${strict.public_signal_label}`);
  }
  if (current.laneTitle && strict.laneTitle && current.laneTitle !== strict.laneTitle) {
    reasons.push(`public_lane_mismatch:${current.laneTitle}->${strict.laneTitle}`);
  }
  return reasons;
}

function sourceScopeReasons(article = {}) {
  const originalLabel = article.public_signal_label || article.public_routing?.public_signal_label || article.public_presentation?.signal_label;
  const originalRoute = article.public_route || article.public_routing?.routing_decision || article.public_routing?.laneTitle;
  const originalCategory = article.primary_category || article.category;
  const scoped = applySourceScopePolicy(article, article.public_routing || {});
  const policy = sourceScopePolicyResult(scoped);
  const reasons = [];
  const body = publicBody(scoped);
  const combined = publicText(scoped);
  const assertiveScopeText = combined
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\b(does not prove|doesn't prove|not evidence of|not proof of|without proving|cannot prove)\b/i.test(sentence))
    .join(' ');

  if (policy.force_non_core_signal) {
    const label = scoped.public_signal_label || scoped.public_routing?.public_signal_label || scoped.public_presentation?.signal_label;
    const route = scoped.public_route || scoped.public_routing?.routing_decision || scoped.public_routing?.laneTitle;
    if (originalLabel === 'Core Signal' || label === 'Core Signal') reasons.push('source_scope_core_signal_overclaim');
    if (originalCategory === 'Cloud Capacity' || scoped.primary_category === 'Cloud Capacity' || scoped.category === 'Cloud Capacity') {
      reasons.push('source_scope_cloud_capacity_overclaim');
    }
    if (!['Cloud Product Read', 'Enterprise Platform Note'].includes(originalRoute || route)) {
      reasons.push(`source_scope_public_route_mismatch:${originalRoute || route || 'missing'}`);
    }
    if (!/\bwhat this does not prove\b/i.test(body)) {
      reasons.push('source_scope_missing_what_this_does_not_prove');
    }
    for (const match of sourceScopeForbiddenClaimMatches(assertiveScopeText)) {
      reasons.push(`source_scope_unsupported_${match}`);
    }
  }

  if ((scoped.primary_category === 'Cloud Capacity' || scoped.category === 'Cloud Capacity')
    && !hasExplicitInfrastructureCapacityEvidence(scoped)) {
    reasons.push('cloud_capacity_without_explicit_capacity_evidence');
  }

  return reasons;
}

function metricSummary(article = {}) {
  const body = publicBody(article);
  const source = sourceText(article);
  const summary = sourceSummaryRatio(body, source);
  return {
    word_count: wordCount(body),
    paragraph_count: paragraphCount(body),
    source_summary_ratio: summary.source_summary_ratio,
    analysis_ratio: Number((1 - summary.source_summary_ratio).toFixed(3)),
  };
}

export function publicPublishQualityGate(article = {}, options = {}) {
  const text = publicText(article);
  const body = publicBody(article);
  const copyGuard = guardPublicCopy(text);
  const antiTemplate = antiTemplateGuardV2(body || text);
  const boilerplate = detectBoilerplate(text);
  const truncation = detectTruncationArtifacts(text);
  const human = humanStyleScore(body);
  const metrics = metricSummary(article);
  const bodyBlocks = cleanArticleBodyBlocks(body);
  const reasons = [];

  for (const label of exactLabelLeaks(text)) reasons.push(`internal_label_leak:${label}`);
  if (!copyGuard.ok) reasons.push(...copyGuard.reasons);
  if (!antiTemplate.ok) reasons.push(...antiTemplate.reasons);
  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text))) reasons.push('schema_or_boilerplate_language_leak');
  if (boilerplate.boilerplate_ratio > 0 || boilerplate.copyright_footer_detected || boilerplate.nav_or_cta_detected) {
    reasons.push('boilerplate_leakage');
  }
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  for (const noun of malformedProperNouns(text)) reasons.push(`proper_noun:${noun.observed}->${noun.expected}`);
  reasons.push(...sourceScopeReasons(article));
  reasons.push(...routeMismatchReasons(article));

  const recent = options.recent || [];
  const duplicateOpenings = duplicateFirstWordPrefixes([
    ...recent.map((item) => ({ id: item.id, text: publicBody(item) })),
    { id: article.id || 'current', text: body },
  ], 10).filter((dup) => dup.second?.id === (article.id || 'current'));
  if (duplicateOpenings.length) reasons.push('duplicate_opening_pattern');
  if (repeatedHeadingSequence(article, recent)) reasons.push('repeated_heading_sequence');

  if (bodyBlocks.length < 8 || metrics.paragraph_count < 8 || metrics.word_count < 520) {
    reasons.push('insufficient_article_body');
  }
  if (!hasLimitation(article)) reasons.push('missing_limitation_or_counterargument');
  if (!hasBottomLine(article)) reasons.push('missing_bottom_line');
  if (metrics.source_summary_ratio > 0.4) reasons.push('source_summary_ratio_above_40_percent');
  if (metrics.analysis_ratio < 0.6) reasons.push('analysis_ratio_below_60_percent');
  if (human.human_style_score < 0.72) reasons.push(...human.reasons.length ? human.reasons : ['human_style_score_low']);

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    metrics: {
      ...metrics,
      forbidden_phrase_count: copyGuard.forbidden.length + antiTemplate.matches.length,
      internal_label_leak_count: exactLabelLeaks(text).length,
      human_style_score: human.human_style_score,
      body_blocks_after_cleaning: bodyBlocks.length,
    },
    copyGuard,
    antiTemplate,
    boilerplate,
    truncation,
  };
}

export function quarantinePublicArticle(article = {}, reasons = []) {
  return {
    ...article,
    public_status: 'quarantined',
    public_publish_blocked: true,
    public_publish_block_reasons: [...new Set(reasons.filter(Boolean))],
    articlePagePublished: false,
    homepagePublished: false,
    archiveOnly: true,
    noindex: true,
    seo_noindex: true,
    seo_noindex_reasons: [...new Set([...(article.seo_noindex_reasons || []), 'public_publish_quality_gate_failed'])],
  };
}

function fallbackSeniorRewrite(article = {}) {
  const cleanBlocks = String(publicBody(article) || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && guardPublicCopy(block).ok)
    .filter((block) => !BOILERPLATE_PATTERNS.some((pattern) => pattern.test(block)))
    .join('\n\n');
  return {
    ...article,
    article_body_markdown: cleanBlocks,
    articleText: cleanBlocks,
    contentText: cleanBlocks,
    fullArticleText: cleanBlocks,
    expertLensFull: {
      ...(article.expertLensFull || {}),
      finalArticleBody: cleanBlocks,
    },
  };
}

export function applyPublicPublishQualityGate(article = {}, options = {}) {
  const first = publicPublishQualityGate(article, options);
  if (first.ok) {
    return {
      ok: true,
      article: {
        ...article,
        public_publish_quality_gate: first,
        quality_scores: {
          ...(article.quality_scores || {}),
          ...first.metrics,
        },
      },
      attempts: 1,
      gate: first,
      reasons: [],
    };
  }

  const rewrite = options.rewrite || fallbackSeniorRewrite;
  const rewritten = rewrite(article, first);
  const second = publicPublishQualityGate(rewritten, { ...options, recent: options.recent || [] });
  if (second.ok) {
    return {
      ok: true,
      article: {
        ...rewritten,
        public_publish_quality_gate: second,
        senior_rewrite_attempted: true,
        quality_scores: {
          ...(rewritten.quality_scores || {}),
          ...second.metrics,
        },
      },
      attempts: 2,
      gate: second,
      reasons: [],
    };
  }

  return {
    ok: false,
    article: quarantinePublicArticle(rewritten, second.reasons),
    attempts: 2,
    gate: second,
    reasons: second.reasons,
  };
}
