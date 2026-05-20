import { buildClaimLedger } from './claim-ledger.mjs';
import { buildEvidencePack } from './evidence-pack-builder.mjs';
import { analyzeSourceExtractionFailClosed } from './source-extraction-fail-closed.mjs';
import { applyVendorRoundupRoutingRule } from './vendor-roundup-routing-rule.mjs';
import { planEditorialAngleV3 } from './editorial-angle-planner-v3.mjs';
import { draftHumanAnalystArticleV3 } from './human-analyst-draft-v3.mjs';
import { seniorEditorRewriteV3 } from './senior-editor-rewrite-v3.mjs';
import { finalPublicArticleModelV3 } from './final-public-article-model-v3.mjs';
import { applyPublicPublishQualityGateV3 } from './public-publish-quality-gate-v3.mjs';
import { sourceFidelityCheck } from './source-fidelity-check.mjs';
import { insightDensityScore } from './insight-density-score.mjs';
import { humanStyleScore } from './human-style-score.mjs';

export const EDITORIAL_ENGINE_V3_VERSION = 'editorial_article_engine_v3';
export const LAUNCH_GENERATION_VERSION = 'launch_ready_v1';

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTitle(article = {}) {
  const source = compact(article.source || '').replace(/\s+(Technology|Blog|Newsroom|AI|Data Centre)$/i, '');
  let title = compact(article.title || '');
  if (source) {
    title = title.replace(new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '');
  }
  title = title.replace(/^([^:]{2,38}):\s+\1:\s+/i, '$1: ');
  return title;
}

function routePublicRouting(angle = {}, article = {}) {
  const local = !/Short Signal|Source Card/i.test(angle.route);
  const laneKey = (() => {
    if (/Power/i.test(angle.archetype || angle.category)) return 'power-market';
    if (/Policy|Risk|Siting/i.test(angle.archetype || angle.category)) return 'policy-risk';
    if (/Technical|Memory|Platform|Cloud/i.test(angle.archetype || angle.route)) return 'stack-shifts';
    if (/Investor|Deal|Capital|Market/i.test(angle.archetype || angle.category)) return 'investor-signals';
    if (/Operator|Data Centers|Cooling/i.test(angle.archetype || angle.category)) return 'operator-alerts';
    return local ? 'todays-constraint' : 'source-watch';
  })();
  return {
    score: Number(article.infrastructure_relevance_score || 0.7),
    visibility: local ? 'core' : 'adjacent',
    laneKey,
    laneTitle: angle.route,
    public_signal_label: angle.public_signal_label,
    editorial_lens: angle.editorial_lens,
    story_archetype: angle.archetype,
    routing_decision: angle.route,
    blocked_reasons: [],
  };
}

function shortFact(article = {}) {
  return compact(article.cleaned_source_text || article.source_evidence_text || article.summary || article.snippet || article.title)
    .split(/(?<=[.!?])\s+/)
    .find((line) => line.length > 40 && line.length < 220)
    || compact(article.title);
}

function atAGlance(article = {}, angle = {}) {
  const fact = shortFact(article);
  return [
    fact,
    `The infrastructure read is ${angle.constraint}, with the decision pressure landing on ${angle.stakeholders?.slice(0, 2).join(' and ') || 'operators and buyers'}.`,
    angle.source_scope_policy?.requires_what_this_does_not_prove
      ? 'This does not prove a capacity milestone; it is a bounded platform or product planning signal.'
      : 'The next proof point is whether timing, capacity, cost, or operating risk changes in a measurable way.',
  ].filter(Boolean).slice(0, 3);
}

function whatToWatch(angle = {}) {
  if (angle.source_scope_policy?.requires_what_this_does_not_prove) {
    return [
      'customer deployments with measurable production outcomes',
      'service terms that alter migration or support planning',
      'independent proof of capacity, delivery, cost, or reliability changes',
    ];
  }
  if (/power|grid/i.test(angle.constraint)) {
    return ['utility interconnection milestones', 'contracted load or power terms', 'permitting and site-readiness evidence'];
  }
  if (/silicon|systems|memory/i.test(angle.constraint)) {
    return ['server qualification timelines', 'accelerator or memory supply signals', 'pricing and procurement behavior'];
  }
  if (/cloud|platform|enterprise/i.test(angle.constraint)) {
    return ['availability terms', 'enterprise adoption evidence', 'migration and support commitments'];
  }
  return ['delivery timing', 'operating cost evidence', 'buyer adoption or competitive response'];
}

function deck(article = {}, angle = {}) {
  if (angle.source_scope_policy?.requires_what_this_does_not_prove) {
    return `${normalizeTitle(article)} is a bounded ${angle.route}: useful for platform planning, but not proof of new capacity.`;
  }
  return `${normalizeTitle(article)} frames how infrastructure teams should test ${angle.constraint} risk.`;
}

function bottomLine(angle = {}) {
  if (angle.source_scope_policy?.requires_what_this_does_not_prove) {
    return `Bottom line: this belongs in the ${angle.route} lane until the proof moves from product or platform positioning into measurable infrastructure delivery.`;
  }
  return `Bottom line: this is publishable because it connects a reported change to ${angle.constraint}, while keeping the broader market claim open until stronger operating proof appears.`;
}

export function buildEditorialArticleV3(article = {}, options = {}) {
  const sourceFirstArticle = {
    ...article,
    rawText: article.cleaned_source_text || article.source_evidence_text || article.rawText,
    articleText: article.cleaned_source_text || article.source_evidence_text || article.articleText,
    contentText: article.cleaned_source_text || article.source_evidence_text || article.contentText,
  };
  const extraction = analyzeSourceExtractionFailClosed(sourceFirstArticle);
  if (!extraction.can_publish_local_article) {
    return {
      ok: false,
      article: {
        ...article,
        public_status: 'quarantined',
        articlePagePublished: false,
        homepagePublished: false,
        archiveOnly: true,
        noindex: true,
        public_publish_block_reasons: extraction.reasons.map((reason) => `source_extraction:${reason}`),
      },
      reasons: extraction.reasons.map((reason) => `source_extraction:${reason}`),
    };
  }

  const evidencePack = buildEvidencePack({
    ...sourceFirstArticle,
    articleText: extraction.cleaned_source_text,
    rawText: extraction.cleaned_source_text,
    cleaned_source_text: extraction.cleaned_source_text,
  });
  const claimLedger = buildClaimLedger({
    ...sourceFirstArticle,
    articleText: extraction.cleaned_source_text,
    cleaned_source_text: extraction.cleaned_source_text,
  });
  const scoped = applyVendorRoundupRoutingRule({
    ...sourceFirstArticle,
    title: normalizeTitle(article),
    cleaned_source_text: extraction.cleaned_source_text,
    source_evidence_text: extraction.cleaned_source_text,
    evidence_pack: {
      ...evidencePack,
      source_count: article.source_count || evidencePack.source_links?.length || 1,
    },
    claim_ledger: claimLedger.claims || claimLedger,
  });
  const angle = planEditorialAngleV3(scoped, options);
  const publicRouting = routePublicRouting(angle, scoped);
  const draft = draftHumanAnalystArticleV3(scoped, angle, options);
  const drafted = {
    ...scoped,
    title: normalizeTitle(scoped),
    deck: deck(scoped, angle),
    summary: deck(scoped, angle),
    snippet: deck(scoped, angle),
    why_it_matters: deck(scoped, angle),
    expertLensShort: deck(scoped, angle),
    expertLensFull: {
      finalArticleBody: draft.article_body_markdown,
      bottomLine: bottomLine(angle),
      atAGlance: atAGlance(scoped, angle),
      watchMetrics: whatToWatch(angle),
      metaDescription: deck(scoped, angle),
    },
    article_body_markdown: draft.article_body_markdown,
    articleText: draft.article_body_markdown,
    contentText: draft.article_body_markdown,
    fullArticleText: draft.article_body_markdown,
    at_a_glance: atAGlance(scoped, angle),
    what_to_watch: whatToWatch(angle),
    bottom_line: bottomLine(angle),
    editorial_thesis: angle.thesis,
    public_route: angle.route,
    public_signal_label: angle.public_signal_label,
    editorial_lens: angle.editorial_lens,
    primary_category: angle.category,
    category: angle.category,
    source_count: angle.source_scope_policy?.source_count || article.source_count || 1,
    source_type: angle.source_scope_policy?.source_type || article.source_type,
    public_routing: publicRouting,
    public_presentation: {},
    publishing_route: angle.route,
    public_generation_version: LAUNCH_GENERATION_VERSION,
    generation_version: LAUNCH_GENERATION_VERSION,
    editorial_engine_version: EDITORIAL_ENGINE_V3_VERSION,
    articlePagePublished: !/Short Signal|Source Card/i.test(angle.route),
    homepagePublished: true,
    archiveOnly: false,
    noindex: /Short Signal|Source Card/i.test(angle.route),
    seo_noindex: /Short Signal|Source Card/i.test(angle.route),
    signalCardOnly: /Short Signal|Source Card/i.test(angle.route),
    public_status: /Short Signal/i.test(angle.route) ? 'short_signal' : 'published',
    public_publish_blocked: false,
    public_publish_block_reasons: [],
    seo_noindex_reasons: [],
    evidence_pack: scoped.evidence_pack,
    claim_ledger: scoped.claim_ledger,
    debug_reasoning: {
      pipeline: [
        'source item',
        'extraction QA',
        'source scope policy',
        'evidence pack',
        'evidence triangulation',
        'editorial route',
        'editorial angle',
        'article thesis',
        'narrative lede',
        'section plan',
        'human analyst draft',
        'senior editor rewrite',
        'source fidelity check',
        'public publish quality gate',
        'final public article model',
      ],
      route_reason: angle.thesis,
    },
  };
  const rewritten = seniorEditorRewriteV3(drafted);
  const fidelity = sourceFidelityCheck(rewritten, scoped.evidence_pack, rewritten.article_body_markdown);
  const gate = applyPublicPublishQualityGateV3(rewritten, {
    recent: options.recent || [],
    rewrite: seniorEditorRewriteV3,
  });
  if (!gate.ok) return gate;

  const publicModel = finalPublicArticleModelV3(gate.article, angle, gate.gate);
  const finalArticle = {
    ...gate.article,
    ...publicModel,
    sourceUrl: gate.article.sourceUrl || gate.article.url || publicModel.source_url,
    url: gate.article.sourceUrl || gate.article.url || publicModel.source_url,
    source_attribution: publicModel.source_attribution,
    public_presentation: publicModel.public_presentation,
    public_publish_blocked: false,
    public_publish_block_reasons: [],
    source_fidelity_check: fidelity,
    quality_scores: {
      ...(gate.article.quality_scores || {}),
      ...(gate.gate.metrics || {}),
      human_style_score: humanStyleScore(gate.article.article_body_markdown).human_style_score,
      insight_density_score: insightDensityScore(gate.article.article_body_markdown).insight_density_score,
    },
  };

  return {
    ok: true,
    article: finalArticle,
    gate: gate.gate,
    angle,
    reasons: [],
  };
}
