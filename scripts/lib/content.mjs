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
import {
  ARTICLE_TYPES,
  INFRASTRUCTURE_LAYERS,
  PRIMARY_CATEGORIES,
  classifyTaxonomy,
} from './taxonomy.mjs';

function fallbackSummary(item, articleText = '') {
  const base = articleText || item.snippet || item.title;
  return truncate(base, 180);
}

function inferTheme(text = '') {
  const lower = text.toLowerCase();
  if (/(gpu|nvidia|amd|inference|training|cluster|hbm)/.test(lower)) {
    return 'compute supply, deployment speed, and network orchestration';
  }
  if (/(power|grid|utility|substation|energy)/.test(lower)) {
    return 'time-to-power, campus sequencing, and capex timing';
  }
  if (/(cooling|thermal|liquid|mep|rack)/.test(lower)) {
    return 'rack-density readiness, fit-out complexity, and uptime discipline';
  }
  if (/(funding|financing|valuation|merger|acquisition|joint venture)/.test(lower)) {
    return 'pricing power, capital structure, and demand confidence';
  }
  if (/(policy|regulation|permit|korea|singapore|japan|malaysia|india)/.test(lower)) {
    return 'market access, permitting speed, and regional execution risk';
  }
  return 'AI infrastructure execution risk';
}

function fallbackInsight(item, articleText = '') {
  const theme = inferTheme(`${item.title} ${item.snippet} ${articleText}`);
  return truncate(
    `The practical effect is on ${theme}. The advantage goes to teams that line up power, facility design, network topology, and silicon timing instead of optimizing one layer in isolation.`,
    260
  );
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

function normalizeAiPayload(aiPayload, fallback) {
  if (!aiPayload || typeof aiPayload !== 'object') return fallback;

  const summary = truncate(normalizeEditorialVoice(aiPayload.summary || fallback.summary), 180);
  const insight = truncate(normalizeEditorialVoice(aiPayload.insight || fallback.insight), 260);
  const tags = unique([...(Array.isArray(aiPayload.tags) ? aiPayload.tags : []), ...fallback.tags]).slice(0, 6);
  const region = aiPayload.region || fallback.region;
  const imagePrompt = aiPayload.imagePrompt || fallback.imagePrompt;
  return {
    ...fallback,
    summary,
    insight,
    tags,
    region,
    imagePrompt,
    taxonomy: aiPayload.taxonomy && typeof aiPayload.taxonomy === 'object'
      ? aiPayload.taxonomy
      : {
        primary_category: aiPayload.primary_category,
        secondary_category: aiPayload.secondary_category,
        infrastructure_layer: aiPayload.infrastructure_layer,
        affected_stakeholders: aiPayload.affected_stakeholders,
        article_type: aiPayload.article_type,
        region: aiPayload.region,
        urgency_score: aiPayload.urgency_score,
      },
  };
}

export async function enrichContent(item) {
  const { articleText, extractionQa } = await fetchArticleExtraction({
    url: item.url,
    title: item.title,
    fallbackSnippet: item.snippet,
  });
  const category = inferCategory(`${item.title} ${item.snippet} ${articleText}`, item.defaultCategory || item.categoryHint);
  const region = inferRegion(`${item.title} ${item.snippet} ${articleText}`, item.region || 'Global');
  const summary = fallbackSummary(item, articleText);
  const fallback = {
    summary,
    insight: fallbackInsight(item, articleText),
    category,
    tags: buildFallbackTags(`${item.title} ${item.snippet} ${articleText}`, category),
    region,
    imagePrompt: fallbackImagePrompt(item, category, summary),
  };

  const aiPayload = await callOpenRouterJson({
    systemPrompt: [
      'You are a veteran editor covering data centers, hyperscalers, cloud infrastructure, semiconductors, power markets, and AI deployment.',
      'Write like a senior newsroom editor, not a strategy deck.',
      'Return JSON only with keys: summary, insight, primary_category, secondary_category, infrastructure_layer, affected_stakeholders, article_type, region, urgency_score, tags, imagePrompt.',
      'summary: 1-2 sentences, 180 characters max, crisp and factual.',
      'insight: 2 sentences max, focused on why this matters for operators / investors / capacity planners.',
      'Avoid phrases such as "Expert lens", "This signal matters", "strategic significance", and "read-through".',
      `primary_category must be one of: ${PRIMARY_CATEGORIES.join(' | ')}`,
      'secondary_category: concise desk/subbeat label grounded in the source.',
      `infrastructure_layer must be one of: ${INFRASTRUCTURE_LAYERS.join(' | ')}`,
      'affected_stakeholders: array of up to 5 concise plural groups such as operators, utilities, hyperscalers, investors, enterprise IT.',
      `article_type must be one of: ${ARTICLE_TYPES.join(' | ')}`,
      'urgency_score: number from 0 to 1 based on timing sensitivity, bottleneck severity, and decision value.',
      'tags: array of up to 6 concise lowercase tags.',
      'region: short market label like Global, Korea, APAC, US, EU, MiddleEast.',
      'imagePrompt: premium editorial image prompt, 16:9, no logos, no text.',
      'Do not invent facts or numbers not supported by the source text.',
    ].join(' '),
    userPrompt: JSON.stringify({
      title: item.title,
      source: item.source,
    url: item.url,
    publishedAt: item.publishedAt,
    snippet: item.snippet,
    articleText,
    fullArticleText: articleText,
    defaultCategory: item.defaultCategory || item.categoryHint || null,
    defaultRegion: item.region || null,
  }),
    maxTokens: 700,
  }).catch(() => null);

  const normalized = normalizeAiPayload(aiPayload, fallback);
  const infrastructureRelevance = classifyInfrastructureRelevance({
    ...item,
    articleText,
    summary: normalized.summary,
    insight: normalized.insight,
    category: normalized.category,
    tags: normalized.tags,
    region: normalized.region,
  });
  const taxonomy = classifyTaxonomy({
    ...item,
    ...infrastructureRelevance,
    articleText,
    summary: normalized.summary,
    insight: normalized.insight,
    category: normalized.category,
    tags: normalized.tags,
    region: normalized.region,
  }, normalized.taxonomy);
  const expertInsight = extractExpertInsight({
    ...item,
    articleText,
    summary: normalized.summary,
    insight: normalized.insight,
    category: taxonomy.primary_category,
    primary_category: taxonomy.primary_category,
    secondary_category: taxonomy.secondary_category,
    infrastructure_layer: taxonomy.infrastructure_layer,
    affected_stakeholders: taxonomy.affected_stakeholders,
    article_type: taxonomy.article_type,
    region: taxonomy.region,
    tags: normalized.tags,
  });

  return {
    ...item,
    slug: slugify(item.title),
    summary: normalized.summary,
    insight: normalized.insight,
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
    tags: normalized.tags,
    region: taxonomy.region,
    imagePrompt: normalized.imagePrompt,
    lang: guessLanguage(`${item.title} ${item.snippet} ${articleText}`),
    articleText,
    content_length: extractionQa.content_length,
    boilerplate_ratio: extractionQa.boilerplate_ratio,
    title_body_similarity: extractionQa.title_body_similarity,
    copyright_footer_detected: extractionQa.copyright_footer_detected,
    nav_or_cta_detected: extractionQa.nav_or_cta_detected,
    sentence_completion_score: extractionQa.sentence_completion_score,
    source_domain_adapter: extractionQa.source_domain_adapter,
    extraction_quality_score: extractionQa.extraction_quality_score,
    extraction_qa: extractionQa,
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
    sourceUrl: item.url,
  };
}
