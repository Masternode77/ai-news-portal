import {
  buildFallbackTags,
  guessLanguage,
  inferCategory,
  inferRegion,
  slugify,
  truncate,
  unique,
} from './normalize.mjs';
import { callOpenRouterJson } from './openrouter.mjs';
import { fetchArticleExtraction } from './source-fetch.mjs';
import { normalizeEditorialVoice } from './editorial-humanizer.mjs';
import { extractExpertInsight } from './expert-insight-engine.mjs';
import { classifyInfrastructureRelevance } from './relevance-classifier.mjs';
import { classifyTaxonomy } from './taxonomy.mjs';

function fallbackSummary(item, articleText = '') {
  const base = articleText || item.snippet || item.title;
  return truncate(base, 180);
}

function fallbackImagePrompt(item, category, summary) {
  return [
    'Editorial hero image for enterprise technology news.',
    'No logos, no text, no watermark, no brand marks.',
    `Topic: ${item.title}.`,
    `Category: ${category}.`,
    `Mood: premium, cinematic, monochrome glass dashboard aesthetic.`,
    `Context: ${summary}.`,
    'Include modern data center, network, semiconductor, cloud, or grid motifs only when relevant.',
    '16:9 composition.',
  ].join(' ');
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateEditorialMetadataPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!nonEmptyString(payload.summary)
    || !nonEmptyString(payload.insight)
    || !nonEmptyString(payload.imagePrompt)
    || !Array.isArray(payload.tags)
    || payload.tags.length < 1
    || payload.tags.length > 6
    || payload.tags.some((tag) => !nonEmptyString(tag))) {
    return null;
  }
  const summary = truncate(normalizeEditorialVoice(payload.summary), 180);
  const insight = truncate(normalizeEditorialVoice(payload.insight), 260);
  const tags = unique(payload.tags.map((tag) => String(tag).trim().toLowerCase())).slice(0, 6);
  const imagePrompt = String(payload.imagePrompt).trim();
  if (!summary || !insight || !tags.length || !imagePrompt) return null;
  return { summary, insight, tags, imagePrompt };
}

export async function extractContentSource(item) {
  const { articleText, extractionQa } = await fetchArticleExtraction({
    url: item.url,
    title: item.title,
    fallbackSnippet: item.snippet,
  });
  return {
    ...item,
    slug: slugify(item.title),
    articleText,
    cleaned_source_text: articleText,
    content_length: extractionQa.content_length,
    boilerplate_ratio: extractionQa.boilerplate_ratio,
    title_body_similarity: extractionQa.title_body_similarity,
    copyright_footer_detected: extractionQa.copyright_footer_detected,
    nav_or_cta_detected: extractionQa.nav_or_cta_detected,
    sentence_completion_score: extractionQa.sentence_completion_score,
    source_domain_adapter: extractionQa.source_domain_adapter,
    extraction_quality_score: extractionQa.extraction_quality_score,
    extraction_qa: extractionQa,
    sourceUrl: item.sourceUrl || item.url,
  };
}

export function classifyExtractedContent(item) {
  const articleText = item.articleText || '';
  const category = inferCategory(`${item.title} ${item.snippet} ${articleText}`, item.defaultCategory || item.categoryHint);
  const region = inferRegion(`${item.title} ${item.snippet} ${articleText}`, item.region || 'Global');
  const summary = fallbackSummary(item, articleText);
  const baseline = {
    summary,
    insight: '',
    category,
    tags: buildFallbackTags(`${item.title} ${item.snippet} ${articleText}`, category),
    region,
    imagePrompt: fallbackImagePrompt(item, category, summary),
  };
  const infrastructureRelevance = classifyInfrastructureRelevance({
    ...item,
    articleText,
    summary: baseline.summary,
    insight: baseline.insight,
    category: baseline.category,
    tags: baseline.tags,
    region: baseline.region,
  });
  const taxonomy = classifyTaxonomy({
    ...item,
    ...infrastructureRelevance,
    articleText,
    summary: baseline.summary,
    insight: baseline.insight,
    category: baseline.category,
    tags: baseline.tags,
    region: baseline.region,
  });
  const expertInsight = extractExpertInsight({
    ...item,
    articleText,
    summary: baseline.summary,
    insight: baseline.insight,
    category: taxonomy.primary_category,
    primary_category: taxonomy.primary_category,
    secondary_category: taxonomy.secondary_category,
    infrastructure_layer: taxonomy.infrastructure_layer,
    affected_stakeholders: taxonomy.affected_stakeholders,
    article_type: taxonomy.article_type,
    region: taxonomy.region,
    tags: baseline.tags,
  });

  return {
    ...item,
    slug: item.slug || slugify(item.title),
    summary: baseline.summary,
    insight: baseline.insight,
    category: taxonomy.primary_category,
    primary_category: taxonomy.primary_category,
    secondary_category: taxonomy.secondary_category,
    infrastructure_layer: taxonomy.infrastructure_layer,
    affected_stakeholders: taxonomy.affected_stakeholders,
    article_type: taxonomy.article_type,
    urgency_score: taxonomy.urgency_score,
    taxonomy_confidence: taxonomy.taxonomy_confidence,
    taxonomy_reasons: taxonomy.taxonomy_reasons,
    expert_insight: expertInsight,
    expertInsight,
    concrete_facts: expertInsight.concrete_facts,
    named_companies: expertInsight.named_companies,
    bottleneck_type: expertInsight.bottleneck_type,
    who_gains_leverage: expertInsight.who_gains_leverage,
    who_takes_execution_risk: expertInsight.who_takes_execution_risk,
    timing_dependency: expertInsight.timing_dependency,
    counterargument: expertInsight.counterargument,
    next_observable_signal: expertInsight.next_observable_signal,
    expert_insight_complete: expertInsight.expert_insight_complete,
    expert_insight_missing_fields: expertInsight.expert_insight_missing_fields,
    tags: baseline.tags,
    region: taxonomy.region,
    imagePrompt: baseline.imagePrompt,
    lang: guessLanguage(`${item.title} ${item.snippet} ${articleText}`),
    direct_ai_infrastructure_relevance: infrastructureRelevance.direct_ai_infrastructure_relevance,
    data_center_relevance: infrastructureRelevance.data_center_relevance,
    cloud_capacity_relevance: infrastructureRelevance.cloud_capacity_relevance,
    semiconductor_relevance: infrastructureRelevance.semiconductor_relevance,
    power_grid_relevance: infrastructureRelevance.power_grid_relevance,
    cooling_relevance: infrastructureRelevance.cooling_relevance,
    capital_markets_relevance: infrastructureRelevance.capital_markets_relevance,
    enterprise_ai_infrastructure_relevance: infrastructureRelevance.enterprise_ai_infrastructure_relevance,
    infrastructure_relevance_score: infrastructureRelevance.infrastructure_relevance_score,
    infrastructure_relevance_tier: infrastructureRelevance.infrastructure_relevance_tier,
    infrastructure_relevance_action: infrastructureRelevance.infrastructure_relevance_action,
    infrastructure_relevance_reasons: infrastructureRelevance.infrastructure_relevance_reasons,
    infrastructure_relevance: infrastructureRelevance,
    sourceUrl: item.sourceUrl || item.url,
  };
}

export async function generateEditorialMetadata(item, dependencies = {}) {
  const callJson = dependencies.callJson || callOpenRouterJson;
  const aiPayload = await callJson({
    systemPrompt: [
      'You are a veteran editor covering data centers, hyperscalers, cloud infrastructure, semiconductors, power markets, and AI deployment.',
      'Write like a senior newsroom editor, not a strategy deck.',
      'Return JSON only with keys: summary, insight, tags, imagePrompt.',
      'summary: 1-2 sentences, 180 characters max, crisp and factual.',
      'insight: 2 sentences max, grounded in the supplied source evidence and its actual decision point.',
      'Avoid reusable infrastructure boilerplate and do not change relevance, category, route, or source facts.',
      'tags: array of up to 6 concise lowercase tags.',
      'imagePrompt: premium editorial image prompt, 16:9, no logos, no text.',
      'Do not invent facts or numbers not supported by the source text.',
    ].join(' '),
    userPrompt: JSON.stringify({
      title: item.title,
      source: item.source,
      url: item.sourceUrl || item.url,
      publishedAt: item.publishedAt,
      snippet: item.snippet,
      articleText: item.articleText,
      primaryCategory: item.primary_category,
      infrastructureLayer: item.infrastructure_layer,
      expertInsight: item.expert_insight,
    }),
    maxTokens: 700,
  }).catch(() => null);

  if (!aiPayload || typeof aiPayload !== 'object') {
    return {
      ok: false,
      article: item,
      error: { code: 'editorial_service_unavailable' },
      retryable: true,
    };
  }

  const normalized = validateEditorialMetadataPayload(aiPayload);
  if (!normalized) {
    return {
      ok: false,
      article: item,
      error: { code: 'editorial_generation_invalid' },
      retryable: false,
    };
  }
  return {
    ok: true,
    article: {
      ...item,
      summary: normalized.summary,
      insight: normalized.insight,
      tags: normalized.tags,
      imagePrompt: normalized.imagePrompt,
    },
  };
}

export async function enrichContent(item) {
  const extracted = await extractContentSource(item);
  const classified = classifyExtractedContent(extracted);
  const generated = await generateEditorialMetadata(classified);
  return generated.ok ? generated.article : classified;
}
