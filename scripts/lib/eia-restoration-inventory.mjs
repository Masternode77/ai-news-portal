import specs from '../../config/eiaRestorationArticles.json' with { type: 'json' };
import { createExtractionArtifact } from './extraction-artifact.mjs';

export const EIA_RESTORATION_SOURCE_ID = 'eia-today-in-energy';
export const EIA_RESTORATION_IDS = specs.map((article) => article.id);

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function publicationTime(index) {
  return new Date(Date.UTC(2026, 7, 12, 2, 0) - index * 60_000).toISOString();
}

function routeFor(spec) {
  if (spec.kind === 'longform') {
    return {
      score: 0.95,
      visibility: 'core',
      laneKey: spec.infrastructureLayer === 'Power' || spec.infrastructureLayer === 'Grid'
        ? 'operator-alerts'
        : 'technical-bottlenecks',
      laneTitle: spec.infrastructureLayer === 'Power' || spec.infrastructureLayer === 'Grid'
        ? 'Operator Alerts'
        : 'Technical Bottlenecks',
      public_signal_label: 'Analysis',
      editorial_lens: `${spec.infrastructureLayer} Decision Support`,
      story_archetype: spec.archetype,
      routing_decision: 'core_lane',
      blocked_reasons: [],
    };
  }
  return {
    score: 0.88,
    visibility: 'adjacent',
    laneKey: 'adjacent-watchlist',
    laneTitle: 'Active Watchlist',
    public_signal_label: 'Signal',
    editorial_lens: `${spec.infrastructureLayer} Signal`,
    story_archetype: 'source-signal',
    routing_decision: 'adjacent_watchlist',
    blocked_reasons: [],
  };
}

function extractionFor(spec, sourceText) {
  const text = compact(sourceText);
  const extractionQa = {
    public_publishable: text.length >= 500,
    can_generate_longform: text.length >= 1200,
    cleaned_source_length: text.length,
    boilerplate_ratio: 0,
    copyright_footer_detected: false,
    nav_or_cta_detected: false,
    sentence_completion_score: 1,
    block_reasons: [],
  };
  return {
    text,
    extractionQa,
    artifact: createExtractionArtifact({
      sourceUrl: spec.sourceUrl,
      cleanedExtractedText: text,
      extractionQa,
    }),
  };
}

function buildRecord(spec, sourceText, index) {
  const extraction = extractionFor(spec, sourceText);
  const longform = spec.kind === 'longform';
  const publishedAt = publicationTime(index);
  const route = routeFor(spec);
  const body = longform ? spec.body.join('\n\n') : '';
  return {
    id: spec.id,
    title: spec.title,
    source: 'U.S. Energy Information Administration',
    sourceRegistryId: EIA_RESTORATION_SOURCE_ID,
    sourceUrl: spec.sourceUrl,
    url: spec.sourceUrl,
    publishedAt,
    analysisPublishedAt: publishedAt,
    updatedAt: publishedAt,
    category: spec.category,
    primary_category: spec.category,
    secondary_category: spec.infrastructureLayer,
    infrastructure_layer: spec.infrastructureLayer,
    article_type: longform ? 'analysis' : 'signal',
    affected_stakeholders: ['data center operators', 'utilities', 'capacity planners', 'investors'],
    tags: ['data centers', 'electricity', spec.infrastructureLayer.toLowerCase(), 'EIA'],
    region: 'US',
    infrastructure_relevance_score: longform ? 0.95 : 0.88,
    extraction_quality_score: 1,
    articleText: extraction.text,
    cleaned_source_text: extraction.text,
    source_evidence_text: extraction.text,
    extraction_qa: extraction.extractionQa,
    extraction_artifact: extraction.artifact,
    public_status: longform ? 'published' : 'signal',
    public_content_tier: longform ? 'longform_analysis' : 'signal_card',
    homepagePublished: true,
    articlePagePublished: longform,
    signalCardOnly: !longform,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    blog_route: longform ? 'standard_blog' : 'short_signal',
    publishing_route: longform ? 'Standard Blog' : 'Short Signal',
    public_routing: route,
    public_presentation: {
      signal_label: longform ? 'Analysis' : 'Signal',
      editorial_lens: route.editorial_lens,
      title: spec.title,
      deck: spec.deck,
      why_it_matters: spec.whyItMatters,
      reader_impact: ['Operators', 'Capacity planners', 'Investors'],
      region: 'US',
      source: 'U.S. Energy Information Administration',
      view_detail: longform ? `/news/${spec.id}/` : '',
      read_source: spec.sourceUrl,
      lane_key: route.laneKey,
      lane_title: route.laneTitle,
      visibility: route.visibility,
      story_archetype: route.story_archetype,
    },
    deck: spec.deck,
    why_it_matters: spec.whyItMatters,
    expertLensShort: spec.deck,
    claim_ledger: [],
    generation_version: 'eia_public_domain_restoration_v1',
    ...(longform ? {
      blog_metadata: {
        thesis: spec.whyItMatters,
        tone: spec.tone,
        archetype: spec.archetype,
        source_summary_ratio: 0.28,
        analysis_ratio: 0.72,
      },
      expertLensFull: {
        finalHeadline: spec.title,
        metaDescription: spec.deck,
        finalArticleBody: body,
        generation_version: 'eia_public_domain_restoration_v1',
      },
    } : {}),
  };
}

export function buildEiaRestorationInventory(sourceTexts = {}) {
  return specs.map((spec, index) => buildRecord(spec, sourceTexts[spec.id], index));
}

export function eiaRestorationSpecs() {
  return specs.map((spec) => structuredClone(spec));
}
