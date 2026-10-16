import specs from '../../config/eiaRestorationArticles.json' with { type: 'json' };
import { extractNumericClaims, splitSentences } from './autonomous-desk-utils.mjs';
import { createExtractionArtifact } from './extraction-artifact.mjs';
import { numericClaimKey } from './numeric-claim-policy.mjs';
import { readerCopyResult } from './reader-copy-guard.mjs';

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

// The analyses quote EIA figures, and the numeric gates accept a body figure
// only when a verified_primary ledger row carries it. Each row quotes the EIA
// sentence that states the figure, taken from the same verified text the
// extraction artifact binds, so a figure the source does not state stays
// unsupported and blocks publication.
function sourceClaimLedger(spec, sourceText, body) {
  const bodyKeys = new Set(extractNumericClaims(body).map(numericClaimKey).filter(Boolean));
  const ledgered = new Set();
  const ledger = [];
  for (const sourceSentence of splitSentences(sourceText)) {
    for (const numeric of extractNumericClaims(sourceSentence)) {
      const key = numericClaimKey(numeric);
      if (!key || !bodyKeys.has(key) || ledgered.has(key)) continue;
      ledgered.add(key);
      ledger.push({
        claim_id: `clm_${spec.id}_${ledger.length + 1}`,
        article_id: spec.id,
        claim_text: sourceSentence,
        claim_type: 'numeric',
        numeric_value: numeric.numeric_value,
        unit: numeric.unit,
        comparator: numeric.comparator,
        source_url: spec.sourceUrl,
        source_name: 'U.S. Energy Information Administration',
        source_quote_or_summary: sourceSentence,
        verification_status: 'verified_primary',
        used_in_article: true,
      });
    }
  }
  return ledger;
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
    // A corrected spec carries its correction notes and the time the body
    // last changed, so a restore keeps both instead of resetting them.
    updatedAt: spec.updatedAt || publishedAt,
    ...(Array.isArray(spec.corrections) && spec.corrections.length ? { corrections: structuredClone(spec.corrections) } : {}),
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
    claim_ledger: longform ? sourceClaimLedger(spec, extraction.text, body) : [],
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

// Spec copy is reader copy: the title, deck and why-it-matters line render on
// every card and the body blocks become the detail page. The check runs on the
// spec, before any record exists, so a config edit cannot publish writer-only
// language even if a later gate were bypassed. Source text is not inspected.
export function eiaRestorationReaderCopyFindings(specList = specs) {
  const findings = [];
  for (const spec of specList) {
    const result = readerCopyResult({
      title: spec.title,
      deck: spec.deck,
      why_it_matters: spec.whyItMatters,
      body: Array.isArray(spec.body) ? spec.body.join('\n\n') : '',
      corrections: spec.corrections,
    });
    for (const finding of result.findings) findings.push({ id: spec.id, ...finding });
  }
  return findings;
}

export function buildEiaRestorationInventory(sourceTexts = {}, { specs: specList = specs } = {}) {
  const findings = eiaRestorationReaderCopyFindings(specList);
  if (findings.length) {
    const summary = [...new Set(findings.map((finding) => `${finding.id}:${finding.code}:${finding.field}`))];
    throw new Error(`EIA restoration spec contains writer-only copy: ${summary.slice(0, 5).join(', ')}`);
  }
  return specList.map((spec, index) => buildRecord(spec, sourceTexts[spec.id], index));
}

export function eiaRestorationSpecs() {
  return specs.map((spec) => structuredClone(spec));
}
