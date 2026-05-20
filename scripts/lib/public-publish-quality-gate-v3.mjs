import { publicPublishQualityGate, quarantinePublicArticle } from './public-publish-quality-gate.mjs';
import { detectBoilerplate } from './boilerplate-detector.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { antiTemplateGuardV2 } from './anti-template-guard-v2.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';
import { sourceSummaryRatio } from './source-summary-ratio.mjs';
import { insightDensityScore } from './insight-density-score.mjs';
import { humanStyleScore } from './human-style-score.mjs';
import { paragraphCount, wordCount, headingSequence } from './visible-body-length.mjs';
import { vendorRoundupRoutingDecision } from './vendor-roundup-routing-rule.mjs';
import { hasExplicitInfrastructureCapacityEvidence } from './source-scope-policy.mjs';

export const PUBLIC_PUBLISH_GATE_V3_VERSION = 'public_publish_quality_gate_v3';

const ROUTE_REQUIREMENTS = {
  'Core Longform Blog': { minWords: 900, maxWords: 1450, minParagraphs: 12 },
  'Standard Blog': { minWords: 650, maxWords: 1100, minParagraphs: 8 },
  'Expert Brief': { minWords: 450, maxWords: 800, minParagraphs: 5 },
  'Short Signal': { minWords: 120, maxWords: 320, minParagraphs: 2 },
  'Source Card': { minWords: 0, maxWords: 0, minParagraphs: 0 },
};

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function body(article = {}) {
  return String(
    article.article_body_markdown
    || article.expertLensFull?.finalArticleBody
    || article.fullArticleText
    || article.contentText
    || article.articleText
    || ''
  ).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function sourceText(article = {}) {
  return compact([
    article.cleaned_source_text,
    article.source_evidence_text,
    article.rawText,
    article.sourceText,
    ...(article.evidence_pack?.facts || []),
    ...(article.evidence_pack?.verified_facts || []),
  ].filter(Boolean).join(' '));
}

function publicText(article = {}) {
  return [
    article.title,
    article.deck,
    article.summary,
    article.snippet,
    article.why_it_matters,
    body(article),
    article.bottom_line,
    ...(article.at_a_glance || []),
    ...(article.what_to_watch || []),
  ].filter(Boolean).join('\n\n');
}

function routeName(article = {}) {
  return article.public_route
    || article.public_routing?.routing_decision
    || article.public_routing?.laneTitle
    || article.publishing_route
    || 'Standard Blog';
}

function isLocalRoute(route = '') {
  return /Core Longform Blog|Standard Blog|Expert Brief|Cloud Product Read|Enterprise Platform Note/i.test(route);
}

function routeRequirements(article = {}) {
  const route = routeName(article);
  if (/Cloud Product Read|Enterprise Platform Note/i.test(route)) return ROUTE_REQUIREMENTS['Expert Brief'];
  return ROUTE_REQUIREMENTS[route] || ROUTE_REQUIREMENTS['Standard Blog'];
}

function hasThesis(article = {}) {
  const text = publicText(article);
  return Boolean(compact(article.editorial_thesis || article.blog_metadata?.thesis))
    || /\b(thesis|the read|the point|what matters|the constraint|the question for)\b/i.test(text);
}

function hasLimitation(article = {}) {
  const text = publicText(article);
  return /\bwhat this does not prove\b|\bdoes not prove\b|\bnot evidence of\b|\blimitation\b|\bcounterargument\b|\bbear case\b|\bmissing evidence\b|\bwhere the claim stops\b|\bthe risk boundary\b/i.test(text);
}

function hasBottomLine(article = {}) {
  return Boolean(compact(article.bottom_line || article.expertLensFull?.bottomLine))
    || /\bbottom line\b/i.test(body(article));
}

function hasSourceUrl(article = {}) {
  const url = article.sourceUrl || article.url || article.source_url;
  if (!url) return false;
  try {
    return Boolean(new URL(url));
  } catch {
    return false;
  }
}

function duplicateOpening(article = {}, recent = []) {
  const opening = body(article).split(/\s+/).slice(0, 10).join(' ').toLowerCase();
  if (!opening) return false;
  return recent.some((item) => body(item).split(/\s+/).slice(0, 10).join(' ').toLowerCase() === opening);
}

function repeatedHeadings(article = {}, recent = []) {
  const sequence = headingSequence(body(article)).join(' > ');
  if (!sequence) return false;
  return recent.filter((item) => headingSequence(body(item)).join(' > ') === sequence).length >= 2;
}

function sourcePrimaryForLocal(article = {}) {
  const route = routeName(article);
  if (!isLocalRoute(route)) return false;
  const href = article.primaryHref || article.public_presentation?.view_detail || '';
  return /^https?:\/\//i.test(href) && !/computecurrent\.com/i.test(href);
}

function sitemapNoindexInconsistent(article = {}) {
  return article.articlePagePublished !== false
    && article.noindex === true
    && article.sitemapIncluded === true;
}

function categoryMismatch(article = {}) {
  if ((article.primary_category === 'Cloud Capacity' || article.category === 'Cloud Capacity') && !hasExplicitInfrastructureCapacityEvidence(article)) {
    return true;
  }
  return false;
}

export function publicPublishQualityGateV3(article = {}, options = {}) {
  const text = publicText(article);
  const articleBody = body(article);
  const v2 = publicPublishQualityGate(article, options);
  const copy = guardPublicCopy(text);
  const template = antiTemplateGuardV2(articleBody || text);
  const boilerplate = detectBoilerplate(text);
  const truncation = detectTruncationArtifacts(text);
  const summary = sourceSummaryRatio(articleBody, sourceText(article));
  const insight = insightDensityScore(articleBody);
  const human = humanStyleScore(articleBody);
  const route = routeName(article);
  const req = routeRequirements(article);
  const words = wordCount(articleBody);
  const paragraphs = paragraphCount(articleBody);
  const vendor = vendorRoundupRoutingDecision(article);
  const reasons = [];

  if (!v2.ok && !/Short Signal|Source Card/i.test(route)) {
    reasons.push(...v2.reasons.filter((reason) => !/^public_(route|lane|signal_label)_mismatch/.test(reason)));
  }
  if (!copy.ok) reasons.push(...copy.reasons);
  if (!template.ok) reasons.push(...template.reasons);
  if (boilerplate.boilerplate_ratio > 0 || boilerplate.copyright_footer_detected || boilerplate.nav_or_cta_detected) reasons.push('public_boilerplate_or_copyright_leakage');
  if (!truncation.ok) reasons.push(...truncation.artifacts.map((reason) => `truncation:${reason}`));
  if (!hasSourceUrl(article)) reasons.push('empty_or_broken_source_url');
  if (sourcePrimaryForLocal(article)) reasons.push('external_source_primary_link_for_local_article_route');
  if (categoryMismatch(article)) reasons.push('category_cloud_capacity_without_explicit_capacity_evidence');
  if (duplicateOpening(article, options.recent || [])) reasons.push('duplicate_opening_pattern');
  if (repeatedHeadings(article, options.recent || [])) reasons.push('repeated_heading_sequence');
  if (!hasThesis(article)) reasons.push('missing_thesis');
  if (!hasLimitation(article)) reasons.push('missing_counterargument_or_limitation');
  if (!hasBottomLine(article)) reasons.push('missing_bottom_line');
  if (sitemapNoindexInconsistent(article)) reasons.push('sitemap_noindex_inconsistency');
  if (vendor.applies && !vendor.ok) reasons.push(...vendor.reasons);
  if (route !== 'Source Card') {
    if (words < req.minWords) reasons.push(`insufficient_article_body:${words}<${req.minWords}`);
    if (paragraphs < req.minParagraphs) reasons.push(`insufficient_paragraph_count:${paragraphs}<${req.minParagraphs}`);
  }
  if (req.maxWords && words > req.maxWords + 120) reasons.push(`article_body_too_long:${words}>${req.maxWords}`);
  if (summary.source_summary_ratio > 0.4) reasons.push('source_summary_ratio_above_40_percent');
  if ((1 - summary.source_summary_ratio) < 0.6) reasons.push('analysis_ratio_below_60_percent');
  if (human.human_style_score < 0.84 && !/Short Signal|Source Card/i.test(route)) reasons.push('human_style_score_below_0.84');
  if (insight.insight_density_score < 0.78 && !/Short Signal|Source Card/i.test(route)) reasons.push('insight_density_below_0.78');

  return {
    ok: reasons.length === 0,
    version: PUBLIC_PUBLISH_GATE_V3_VERSION,
    reasons: [...new Set(reasons)],
    route,
    metrics: {
      word_count: words,
      paragraph_count: paragraphs,
      source_summary_ratio: summary.source_summary_ratio,
      analysis_ratio: Number((1 - summary.source_summary_ratio).toFixed(3)),
      human_style_score: human.human_style_score,
      insight_density_score: insight.insight_density_score,
      forbidden_phrase_count: (copy.forbidden || []).length + (template.matches || []).length,
    },
    v2,
    vendor,
  };
}

function downgradeRoute(article = {}, reasons = []) {
  if (reasons.some((reason) => /insufficient_article_body|insufficient_paragraph_count|human_style|insight_density/.test(reason))) {
    return {
      ...article,
      public_route: 'Short Signal',
      public_signal_label: 'Short Signal',
      articlePagePublished: false,
      signalCardOnly: true,
      noindex: true,
      seo_noindex: true,
      public_presentation: {
        ...(article.public_presentation || {}),
        signal_label: 'Short Signal',
        lane_key: 'adjacent-watchlist',
        lane_title: 'Adjacent Watchlist',
      },
    };
  }
  return article;
}

export function applyPublicPublishQualityGateV3(article = {}, options = {}) {
  const first = publicPublishQualityGateV3(article, options);
  if (first.ok) {
    return {
      ok: true,
      attempts: 1,
      gate: first,
      reasons: [],
      article: {
        ...article,
        public_publish_quality_gate_v3: first,
        quality_scores: {
          ...(article.quality_scores || {}),
          ...first.metrics,
        },
      },
    };
  }

  const rewrite = options.rewrite || ((item) => item);
  const rewritten = rewrite(article, first);
  const second = publicPublishQualityGateV3(rewritten, options);
  if (second.ok) {
    return {
      ok: true,
      attempts: 2,
      gate: second,
      reasons: [],
      article: {
        ...rewritten,
        senior_rewrite_attempted: true,
        public_publish_quality_gate_v3: second,
        quality_scores: {
          ...(rewritten.quality_scores || {}),
          ...second.metrics,
        },
      },
    };
  }

  const downgraded = downgradeRoute(rewritten, second.reasons);
  const third = downgraded === rewritten ? second : publicPublishQualityGateV3(downgraded, options);
  if (third.ok && /Short Signal/i.test(downgraded.public_route || '')) {
    return {
      ok: true,
      attempts: 3,
      gate: third,
      reasons: [],
      article: {
        ...downgraded,
        public_publish_quality_gate_v3: third,
        quality_scores: {
          ...(downgraded.quality_scores || {}),
          ...third.metrics,
        },
      },
    };
  }

  return {
    ok: false,
    attempts: downgraded === rewritten ? 2 : 3,
    gate: third,
    reasons: third.reasons,
    article: quarantinePublicArticle(downgraded, third.reasons),
  };
}
