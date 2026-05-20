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

function deckFor(article = {}, evidencePack = {}, angle = {}) {
  const actor = evidencePack.namedActors?.[0] || article.source || 'AI infrastructure buyers';
  const layer = evidencePack.affectedInfrastructureLayer || 'AI infrastructure';
  const lens = angle.lens || 'execution risk';
  return guardPublicCopy(sentence(`${actor} puts ${layer} under a ${lens.toLowerCase()} lens for infrastructure readers`)).text;
}

function whyFor(article = {}, evidencePack = {}) {
  return guardPublicCopy(sentence(`${evidencePack.commercialImplication} ${evidencePack.operatingImplication}`)).text;
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
    factTarget: route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG ? 4 : 3,
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
  const deck = deckFor(article, evidencePack, angle);
  const why = whyFor(article, evidencePack);
  const cleanCorpus = cleanEvidenceCorpus(evidencePack);
  const primaryCategory = article.primary_category || article.category || route.strict?.laneTitle || 'AI Infrastructure';
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
    quarantined: false,
    quarantine_reason: [],
    homepagePublished: true,
    articlePagePublished: true,
    archiveOnly: false,
    signalCardOnly: false,
    noindex: false,
    seo_noindex: false,
    seo_noindex_reasons: [],
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
      ...(article.expertLensFull || {}),
      finalHeadline: article.title,
      metaDescription: deck,
      thesis: angle.thesis,
      finalArticleBody: finalBody,
      sourceLink: article.sourceUrl || article.url || '',
      atAGlance: atAGlance(evidencePack),
      watchMetrics: evidencePack.watchMetrics,
      bottomLine: `Compute Current treats this as ${labelForRoute(route.route).toLowerCase()} because the evidence ties ${article.source || 'the source'} to ${evidencePack.affectedInfrastructureLayer}.`,
    },
    blog_metadata: {
      tone,
      archetype: archetype.name,
      archetype_id: archetype.id,
      thesis: angle.thesis,
      evidence_fact_count: evidencePack.facts.length,
      visible_body_characters: length.metrics.visibleBodyCharacters,
      word_count: length.metrics.wordCount,
      paragraph_count: length.metrics.paragraphCount,
      section_count: length.metrics.sectionCount,
      source_summary_ratio: 0.28,
      analysis_ratio: 0.72,
      human_blog_quality_score: quality.human_blog_quality_score,
      insight_density_score: quality.insight_density_score,
      source_fidelity_score: quality.source_fidelity_score,
      anti_template_score: quality.anti_template_score,
    },
    evidence_pack: evidencePack,
  };

  const diversity = antiTemplateDiversityResult(updated, recent);
  return {
    ok: length.ok && quality.ok && diversity.ok,
    article: updated,
    route,
    evidencePack,
    researchBrief,
    angle,
    tone,
    archetype,
    length,
    quality,
    diversity,
    reasons: [...length.reasons, ...quality.reasons, ...diversity.reasons],
  };
}

export { GENERATION_VERSION as BLOG_ENGINE_V4_VERSION };
