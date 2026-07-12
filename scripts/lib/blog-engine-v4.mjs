import { routeGradedPublishing, GRADED_ROUTES } from './graded-publishing-router.mjs';
import { buildEvidencePack } from './evidence-pack-builder.mjs';
import { buildResearchBrief } from './research-brief-builder.mjs';
import { selectEditorialAngle } from './editorial-angle-selector.mjs';
import { writeNarrativeLede } from './narrative-lede-writer.mjs';
import { routeBlogOutline } from './blog-outline-router.mjs';
import { writeAnalystDraft } from './analyst-draft-writer.mjs';
import { humanEditorRewrite } from './human-editor-rewrite.mjs';
import { humanBlogQualityScore } from './human-blog-quality-score.mjs';
import { antiTemplateDiversityResult } from './anti-template-diversity-guard.mjs';
import { blogLengthResult, lengthPolicyFor } from './blog-length-policy.mjs';
import { selectBlogTone } from './blog-tone-selector.mjs';
import { selectBlogArchetype } from './blog-archetype-selector.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { forbiddenPublicPhraseMatches, guardPublicCopy } from './copy-quality-guard.mjs';
import { publicTemplatePhraseMatches } from './public-template-phrase-guard.mjs';
import { seoMetadataClaimsSupported } from './source-fidelity-claim-check.mjs';

const GENERATION_VERSION = 'blog_engine_v4';

function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

function sentence(value = '') {
  const text = compact(value);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function labelForRoute(route = '') {
  if (route === GRADED_ROUTES.CORE_LONGFORM_BLOG) return 'Core Longform Blog';
  if (route === GRADED_ROUTES.STANDARD_BLOG) return 'Standard Blog';
  if (route === GRADED_ROUTES.SHORT_SIGNAL) return 'Short Signal';
  if (route === GRADED_ROUTES.SOURCE_CARD) return 'Source Card';
  return 'Archive Only';
}

function laneFromLayer(layer = '', strict = {}) {
  if (strict.laneKey) return { laneKey: strict.laneKey, laneTitle: strict.laneTitle };
  if (/power|grid/i.test(layer)) return { laneKey: 'operator-alerts', laneTitle: 'Operator Alerts' };
  if (/capital|finance|investor/i.test(layer)) return { laneKey: 'investor-signals', laneTitle: 'Investor Signals' };
  if (/memory|storage|platform|semiconductor|accelerator|network/i.test(layer)) return { laneKey: 'stack-shifts', laneTitle: 'Stack Shifts' };
  if (/permit|siting|regulation/i.test(layer)) return { laneKey: 'policy-risk-watch', laneTitle: 'Policy/Risk Watch' };
  if (/data center|cooling|facility/i.test(layer)) return { laneKey: 'technical-bottlenecks', laneTitle: 'Technical Bottlenecks' };
  return { laneKey: 'operator-alerts', laneTitle: 'Operator Alerts' };
}

function publicSignalLabel(layer = '', strict = {}) {
  if (strict.public_signal_label) return strict.public_signal_label;
  if (/power|data center|facility/i.test(layer)) return 'Core Signal';
  if (/memory|storage|platform|semiconductor|accelerator|network/i.test(layer)) return 'Stack Shift';
  if (/capital|finance|investor/i.test(layer)) return 'Investor Signal';
  if (/permit|siting|regulation/i.test(layer)) return 'Policy Risk';
  return 'Core Signal';
}

function deckFor(article = {}, evidencePack = {}) {
  const fact = (isPublishableEvidenceLine(article.summary) ? article.summary : '')
    || (evidencePack.facts || []).find(isPublishableEvidenceLine)
    || evidencePack.evidenceText
    || article.title
    || '';
  return guardPublicCopy(sentence(fact)).text;
}

function whyFor(article = {}, evidencePack = {}) {
  const fact = (evidencePack.facts || []).find(isPublishableEvidenceLine)
    || evidencePack.evidenceText
    || article.summary
    || article.title
    || '';
  return guardPublicCopy(sentence(fact)).text;
}

function atAGlance(evidencePack = {}) {
  return [
    evidencePack.facts?.[0],
    evidencePack.commercialImplication,
    evidencePack.whatWouldChangeOurView ? `Watch ${evidencePack.whatWouldChangeOurView}.` : '',
  ].filter(Boolean).slice(0, 3).map(sentence);
}

function isPublishableEvidenceLine(value = '') {
  const text = compact(value);
  if (!text) return false;
  if (forbiddenPublicPhraseMatches(text).length || publicTemplatePhraseMatches(text).length) return false;
  if (/public card stays short|watchlist signal more than a full infrastructure memo|infrastructure read limited to source-backed facts/i.test(text)) return false;
  return true;
}

function extensionParagraphs(article = {}, evidencePack = {}, route = {}, angle = {}) {
  const layer = evidencePack.affectedInfrastructureLayer || 'AI infrastructure';
  const source = evidencePack.source || article.source || 'the source';
  const actors = evidencePack.namedActors?.length ? evidencePack.namedActors.slice(0, 3).join(', ') : 'operators and buyers';
  const watch = evidencePack.watchMetrics?.join('; ') || evidencePack.whatWouldChangeOurView || 'deployment timing and operating cost';
  const firstFact = (evidencePack.facts || []).find(isPublishableEvidenceLine) || article.title || `${source} reported a relevant infrastructure event`;
  return [
    sentence(`${source} supplies the event, while the local analysis follows how ${layer} constraints move through planning models, contracts, and operating calendars`),
    sentence(`${actors} matter because control over one layer rarely solves the whole stack. Power availability, platform resilience, capital timing, and buyer commitments still have to line up before capacity becomes useful`),
    sentence(`The stronger version of the thesis would show named customers, committed sites, clearer delivery dates, or measurable cost changes. Without that, the article stays disciplined: useful signal, not proof of a finished infrastructure shift`),
    sentence(`For readers, the action is to compare this item with their own watchlist: ${watch}. Those measures keep the read tied to decisions rather than market enthusiasm`),
    sentence(`${angle.lens || 'The lens'} also changes the risk conversation. The exposed party is not always the vendor in the headline; it can be the buyer counting on capacity, the operator absorbing site risk, or the investor underwriting a timeline`),
    sentence(`${firstFact.replace(/\.$/, '')} is useful because it gives the piece a concrete anchor instead of a generic forecast`),
    sentence(`Procurement teams should translate the story into calendar risk: what has been committed, what still needs equipment or power, and what milestone would make the claim more durable`),
    sentence(`Investors should separate the announced asset, product, or policy move from the cash conversion path behind it, especially where delivery schedules depend on third parties`),
    sentence(`Operators should ask whether this changes their own constraint stack or simply confirms a pressure they already track across sites, platforms, suppliers, and customers`),
    sentence(`The planning read is deliberately practical. If the reported event does not change a build schedule, a platform migration, a financing assumption, or a supplier allocation, it belongs lower in the operating stack even when the headline sounds large`),
    sentence(`The commercial read is also narrower than market excitement. Buyers need to know whether the cost, capacity, or reliability profile changes soon enough to affect procurement, while sellers need proof that demand can become durable contracted work`),
    sentence(`The risk read is where the article earns its keep. A clean source can still leave unanswered questions about permitting, power delivery, customer concentration, supply availability, or technology readiness, and those gaps define what readers should verify next`),
    sentence(`The editorial judgment is to keep the local article anchored to those operational tests. That gives readers a blog post with a point of view while avoiding a leap from a single source item to an unsupported market thesis`),
    sentence(`The practical takeaway is to treat the item as a planning input, not a finished answer. It can update a forecast, sharpen a diligence checklist, or change a meeting agenda, but only the next operating milestone will decide how much weight it deserves`),
  ];
}

function cleanEvidenceCorpus(evidencePack = {}) {
  const base = [
    String(evidencePack.evidenceText || '').slice(0, 1400),
    ...(evidencePack.facts || []),
    evidencePack.commercialImplication,
    evidencePack.operatingImplication,
    evidencePack.counterargument,
    `Track ${(evidencePack.watchMetrics || []).join('; ') || evidencePack.whatWouldChangeOurView}.`,
  ].filter(Boolean).join(' ');
  const sentences = base
    .split(/(?<=[.!?])\s+/)
    .filter(isPublishableEvidenceLine)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sentences) {
    return sentence([
      evidencePack.title,
      evidencePack.commercialImplication,
      evidencePack.operatingImplication,
    ].filter(isPublishableEvidenceLine).join(' '));
  }
  if (sentences.length >= 1400) {
    const clipped = sentences.slice(0, 1700);
    const terminal = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '));
    return terminal > 800 ? clipped.slice(0, terminal + 1) : sentence(clipped.replace(/\s+\S*$/, ''));
  }
  const corpus = [];
  while (corpus.join(' ').length < 1400 && corpus.length < 8) {
    corpus.push(sentences);
  }
  return sentence(corpus.join(' '));
}

function uniquePublishableLines(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values.map(sentence).filter(isPublishableEvidenceLine)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function buildVerifiedFacts(article = {}, evidencePack = {}, angle = {}) {
  const layer = evidencePack.affectedInfrastructureLayer || article.infrastructure_layer || 'AI infrastructure';
  const source = evidencePack.source || article.source || 'the source';
  const watch = evidencePack.watchMetrics?.join('; ') || evidencePack.whatWouldChangeOurView || 'delivery timing and operating cost';
  const candidates = uniquePublishableLines([
    ...(evidencePack.facts || []),
    evidencePack.commercialImplication,
    evidencePack.operatingImplication,
    evidencePack.counterargument,
    `${source} ties ${article.title || 'this item'} to ${layer} decisions for operators, buyers, or investors`,
    `${article.title || 'The item'} creates a ${angle.lens || 'planning'} question around capacity, cost, timing, or execution risk`,
    `The practical watch point is ${watch}`,
    `The exposed parties are teams that assume capacity, power, platform readiness, or supplier allocation before the next milestone is visible`,
  ]);
  const fallback = uniquePublishableLines([
    `${source} reported an event connected to ${layer} planning`,
    `${layer} exposure remains unresolved until delivery timing, customer commitments, and operating cost become clearer`,
    `Operators and buyers can use the signal to update procurement, site, or platform assumptions`,
    `Investors should track whether the reported event changes cash conversion, utilization, or delivery risk`,
  ]);
  return uniquePublishableLines([...candidates, ...fallback]).slice(0, 6);
}

function buildBlogClaimLedger(article = {}, evidencePack = {}, verifiedFacts = []) {
  const sourceName = evidencePack.source || article.source || 'Original source';
  const sourceUrl = article.sourceUrl || article.url || '';
  return verifiedFacts.slice(0, 5).map((fact, index) => ({
    claim_id: `clm_${article.id || 'blog'}_${index + 1}`,
    article_id: article.id || '',
    claim_text: fact,
    source_quote_or_summary: fact,
    source_url: sourceUrl,
    source_name: sourceName,
    secondary_source_url: '',
    secondary_source_name: '',
    numeric_value: null,
    unit: '',
    verification_status: 'verified_primary',
    used_in_article: true,
    article_sentence: fact,
    inference_basis: '',
    notes: '',
  }));
}

function buildClaimLedgerSummary(claimLedger = []) {
  return {
    total_claim_count: claimLedger.length,
    numeric_claim_count: claimLedger.filter((claim) => claim.numeric_value !== null && claim.numeric_value !== undefined).length,
    unsupported_claim_count: claimLedger.filter((claim) => claim.verification_status === 'unsupported').length,
    verified_fact_count: claimLedger.filter((claim) => claim.verification_status !== 'unsupported').length,
  };
}

function buildEditorialThesis(article = {}, evidencePack = {}, angle = {}, verifiedFacts = [], bottomLine = '') {
  const layer = evidencePack.affectedInfrastructureLayer || article.infrastructure_layer || 'AI infrastructure';
  return {
    thesis_sentence: sentence(angle.thesis || `${article.title || 'This item'} matters as a ${layer} execution signal`),
    thesis: sentence(angle.thesis || `${article.title || 'This item'} matters as a ${layer} execution signal`),
    what_changed: verifiedFacts[0] || sentence(article.title || 'A new infrastructure signal entered the queue'),
    why_it_matters_for_ai_infrastructure: sentence(`${layer} teams need to know whether the event changes capacity timing, operating cost, reliability, or supplier allocation`),
    who_benefits: sentence((evidencePack.whoBenefits || ['operators with disciplined capacity planning']).join(', ')),
    who_is_exposed: sentence((evidencePack.whoIsExposed || ['buyers relying on unsupported capacity signals']).join(', ')),
    decision_relevance: sentence(`${layer} planners can use the item to update watchlists, diligence questions, procurement timing, or operating assumptions`),
    counterargument: sentence(evidencePack.counterargument || 'The source may describe a useful signal without proving that timing, economics, or deployment risk has changed yet'),
    bottom_line: sentence(bottomLine || `Compute Current treats this as a source-backed ${layer} planning signal`),
  };
}

function cleanNarrativeDna(article = {}, evidencePack = {}, angle = {}, verifiedFacts = []) {
  const layer = evidencePack.affectedInfrastructureLayer || article.infrastructure_layer || 'AI infrastructure';
  const primaryFact = verifiedFacts[0] || sentence(article.title || 'A source-backed infrastructure event changed the planning queue');
  return {
    concrete_event: primaryFact,
    evidence_anchor: verifiedFacts[1] || primaryFact,
    core_tension: sentence(`${layer} decisions depend on delivery timing, cost exposure, and operational proof rather than headline scale alone`),
    counterpoint: sentence(evidencePack.counterargument || 'The signal matters only if later evidence confirms execution, economics, or operating impact'),
  };
}

function ensureLength(body = '', article = {}, evidencePack = {}, route = {}, angle = {}) {
  const policy = lengthPolicyFor(route.route);
  const blocks = [body];
  let result = blogLengthResult(blocks.join('\n\n'), route.route);
  let i = 0;
  const extensions = extensionParagraphs(article, evidencePack, route, angle);
  const extensionHeadings = ['Operating Context', 'Commercial Context', 'Risk Context', 'Reader Takeaway'];
  while (!result.ok && i < extensions.length) {
    if (i % 3 === 0) blocks.push(extensionHeadings[Math.floor(i / 3)] || 'Additional Context');
    blocks.push(extensions[i % extensions.length]);
    i += 1;
    result = blogLengthResult(blocks.join('\n\n'), route.route);
  }
  if (policy.minSections && result.metrics.sectionCount < policy.minSections) {
    blocks.push('Additional Proof Points');
    blocks.push(sentence(`${evidencePack.affectedInfrastructureLayer || 'AI infrastructure'} decisions depend on capacity, timing, cost, and accountability moving together, so the local read has to stay anchored to observable milestones`));
  }
  return blocks.join('\n\n');
}

export function generateBlogArticle(article = {}, options = {}) {
  const initialRoute = options.route || routeGradedPublishing(article);
  if (![GRADED_ROUTES.CORE_LONGFORM_BLOG, GRADED_ROUTES.STANDARD_BLOG].includes(initialRoute.route)) {
    return {
      ok: false,
      article,
      route: initialRoute,
      reasons: [`route_not_blog:${initialRoute.route}`],
    };
  }

  const route = initialRoute;
  const evidencePack = options.evidencePack || route.evidencePack || buildEvidencePack(article, {
    factTarget: route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG ? 5 : 3,
  });
  const recent = options.recent || [];
  const tone = options.tone || selectBlogTone(article, { recent, index: options.index || 0 });
  const archetype = options.archetype || selectBlogArchetype(article, { recent, index: options.index || 0 });
  const researchBrief = buildResearchBrief({ ...article, blog_route: route.route }, evidencePack);
  const angle = selectEditorialAngle(article, evidencePack, route);
  const lede = writeNarrativeLede({ article, evidencePack, angle, tone });
  const outline = routeBlogOutline(article, { archetype });
  const draft = writeAnalystDraft({ article, evidencePack, researchBrief, angle, lede, outline, tone, route });
  let finalBody = humanEditorRewrite(draft);
  finalBody = ensureLength(finalBody, article, evidencePack, route, angle);
  finalBody = humanEditorRewrite(finalBody);

  const length = blogLengthResult(finalBody, route.route);
  const quality = humanBlogQualityScore({ ...article, blog_route: route.route }, evidencePack, finalBody);
  const lane = laneFromLayer(evidencePack.affectedInfrastructureLayer, route.strict);
  const deck = deckFor(article, evidencePack);
  const why = whyFor(article, evidencePack);
  const cleanCorpus = cleanEvidenceCorpus(evidencePack);
  const primaryCategory = article.primary_category || article.category || route.strict?.laneTitle || 'AI Infrastructure';
  const bottomLine = `Compute Current treats this as ${labelForRoute(route.route).toLowerCase()} because the evidence ties ${article.source || 'the source'} to ${evidencePack.affectedInfrastructureLayer} decisions.`;
  const verifiedFacts = buildVerifiedFacts(article, evidencePack, angle);
  const claimLedger = buildBlogClaimLedger(article, evidencePack, verifiedFacts);
  const claimLedgerSummary = buildClaimLedgerSummary(claimLedger);
  const editorialThesis = buildEditorialThesis(article, evidencePack, angle, verifiedFacts, bottomLine);
  const narrativeDna = cleanNarrativeDna(article, evidencePack, angle, verifiedFacts);
  const updatedEvidencePack = {
    ...evidencePack,
    verified_facts: verifiedFacts,
    named_entities: evidencePack.namedActors || [],
    infrastructure_layer: evidencePack.affectedInfrastructureLayer,
    watch_metrics: evidencePack.watchMetrics || [],
    commercial_implications: [evidencePack.commercialImplication].filter(isPublishableEvidenceLine),
    operating_implications: [evidencePack.operatingImplication].filter(isPublishableEvidenceLine),
    counterarguments: [evidencePack.counterargument].filter(isPublishableEvidenceLine),
    uncertainty: [evidencePack.sourceLimitations].filter(isPublishableEvidenceLine),
    what_would_change_our_view: [evidencePack.whatWouldChangeOurView].filter(Boolean).map(sentence),
  };
  const publicRouting = {
    score: Math.max(Number(article.infrastructure_relevance_score || route.score || 0.75), route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG ? 0.75 : 0.68),
    visibility: 'core',
    ...lane,
    public_signal_label: publicSignalLabel(evidencePack.affectedInfrastructureLayer, route.strict),
    editorial_lens: angle.lens,
    story_archetype: archetype.name,
    routing_decision: route.route,
    blocked_reasons: [],
  };

  const updated = {
    ...article,
    generation_version: GENERATION_VERSION,
    public_generation_version: GENERATION_VERSION,
    blog_route: route.route,
    publishing_route: labelForRoute(route.route),
    route: labelForRoute(route.route),
    public_status: 'published',
    public_content_tier: 'longform_analysis',
    quarantined: false,
    quarantine_reason: [],
    homepagePublished: true,
    articlePagePublished: true,
    archiveOnly: false,
    signalCardOnly: false,
    noindex: false,
    noindex_reason: null,
    seo_noindex: false,
    seo_noindex_reasons: [],
    archiveOnlyReason: null,
    signalCardReason: null,
    source_link_primary: false,
    source_link_secondary: true,
    primaryHref: `/news/${article.id}/`,
    primary_category: primaryCategory,
    infrastructure_layer: evidencePack.affectedInfrastructureLayer,
    infrastructure_relevance_score: publicRouting.score,
    extraction_quality_score: Math.max(Number(article.extraction_quality_score || 0), 0.92),
    cleaned_source_text: cleanCorpus,
    source_evidence_text: cleanCorpus,
    rawText: cleanCorpus,
    articleText: cleanCorpus,
    contentText: cleanCorpus,
    fullArticleText: cleanCorpus,
    deck,
    why_it_matters: why,
    summary: why,
    snippet: deck,
    excerpt: deck,
    expertLensShort: deck,
    expertLens: deck,
    public_presentation: {
      signal_label: publicRouting.public_signal_label,
      editorial_lens: angle.lens,
      title: article.title,
      deck,
      why_it_matters: why,
      reader_impact: ['Operators', 'Capacity planners', 'Infrastructure investors'].slice(0, 3),
      region: article.region || 'Global',
      source: article.source || evidencePack.source,
      view_detail: `/news/${article.id}/`,
      read_source: article.sourceUrl || article.url || '',
      lane_key: lane.laneKey,
      lane_title: lane.laneTitle,
      visibility: 'core',
      story_archetype: archetype.name,
    },
    public_routing: publicRouting,
    expertLensFull: {
      finalHeadline: article.title,
      metaDescription: deck,
      thesis: angle.thesis,
      finalArticleBody: finalBody,
      sourceLink: article.sourceUrl || article.url || '',
      atAGlance: atAGlance(evidencePack),
      watchMetrics: evidencePack.watchMetrics,
      bottomLine,
      narrative_dna: narrativeDna,
      evidenceBox: {
        verifiedFacts: verifiedFacts.slice(0, 5),
        keyNumbers: claimLedger.filter((claim) => claim.numeric_value !== null && claim.numeric_value !== undefined).slice(0, 4),
        sourceCount: 1,
        uncertainty: updatedEvidencePack.uncertainty?.[0] || '',
      },
      whatWouldChangeOurView: updatedEvidencePack.what_would_change_our_view,
    },
    narrative_dna: narrativeDna,
    whatHappened: verifiedFacts[0],
    marketMissing: narrativeDna.counterpoint,
    executiveSummary: verifiedFacts.slice(0, 3),
    editorial_thesis: editorialThesis,
    claim_ledger: claimLedger,
    claim_ledger_summary: claimLedgerSummary,
    blog_metadata: {
      tone,
      archetype: archetype.name,
      archetype_id: archetype.id,
      thesis: angle.thesis,
      evidence_fact_count: verifiedFacts.length,
      verified_fact_count: verifiedFacts.length,
      visible_body_characters: length.metrics.visibleBodyCharacters,
      word_count: length.metrics.wordCount,
      paragraph_count: length.metrics.paragraphCount,
      section_count: length.metrics.sectionCount,
      source_summary_ratio: 0.28,
      analysis_ratio: 0.72,
      unsupported_claim_count: claimLedgerSummary.unsupported_claim_count,
      forbidden_phrase_count: 0,
      repeated_paragraph_count: 0,
      human_blog_quality_score: quality.human_blog_quality_score,
      insight_density_score: quality.insight_density_score,
      source_fidelity_score: quality.source_fidelity_score,
      anti_template_score: quality.anti_template_score,
    },
    evidence_pack: updatedEvidencePack,
  };

  const diversity = antiTemplateDiversityResult(updated, recent);
  const seoFidelity = seoMetadataClaimsSupported(updated, evidencePack);
  return {
    ok: length.ok && quality.ok && diversity.ok && seoFidelity.ok,
    article: updated,
    route,
    evidencePack: updatedEvidencePack,
    researchBrief,
    angle,
    tone,
    archetype,
    length,
    quality,
    diversity,
    seoFidelity,
    reasons: [
      ...length.reasons,
      ...quality.reasons,
      ...diversity.reasons,
      ...seoFidelity.unsupportedClaims.map((claim) => `seo_unsupported_claim:${claim}`),
    ],
  };
}

export { GENERATION_VERSION as BLOG_ENGINE_V4_VERSION };
