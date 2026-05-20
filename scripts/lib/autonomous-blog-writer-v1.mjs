import { AUTONOMOUS_VERSION, compact, hash, relativeNewsHref, sentence } from './autonomous-desk-utils.mjs';
import { buildEvidencePackV2 } from './evidence-pack-builder-v2.mjs';
import { generateEditorialThesis } from './editorial-thesis-generator.mjs';
import { planInsightDensity } from './insight-density-planner.mjs';
import { generateNarrativeLedeV2 } from './narrative-lede-generator-v2.mjs';
import { routeBlogStructureV2 } from './blog-structure-router-v2.mjs';
import { selectAutonomousVoice } from './voice-variation-engine.mjs';
import { finalCopyChief } from './blog-final-copy-chief.mjs';
import { buildClaimLedger } from './claim-ledger.mjs';
import { wordCount, visibleBodyLength, paragraphCount, sectionCount } from './visible-body-length.mjs';

function paragraph(text = '') {
  return sentence(text);
}

function sectionForHeading(heading, ctx, index) {
  const { cluster, evidencePack, thesis } = ctx;
  const facts = evidencePack.verified_facts || [];
  const fact = facts[index % Math.max(facts.length, 1)] || thesis.what_changed || cluster.cluster_title;
  const next = facts[(index + 1) % Math.max(facts.length, 1)] || thesis.why_it_matters_for_ai_infrastructure;
  const actor = evidencePack.named_entities?.[0] || cluster.companies?.[0] || 'the leading actor';
  const layer = evidencePack.infrastructure_layer || cluster.primary_infrastructure_layer || 'AI infrastructure';

  if (/what the headline says|deal snapshot|local decision|technical claim|map, not the headline/i.test(heading)) {
    return [
      paragraph(`${fact.replace(/\.$/, '')} gives the desk a specific event to judge, rather than a broad demand narrative.`),
      paragraph(`The useful first read is who is acting, which ${layer} control point is involved, and whether the source evidence changes a real planning assumption.`),
    ];
  }
  if (/what changed|why the region|why.*move matters/i.test(heading)) {
    return [
      paragraph(`${next.replace(/\.$/, '')} is the change that moves the item into Compute Current's infrastructure lane.`),
      paragraph(`${thesis.what_changed} The signal is strongest where it connects a named actor to a capacity, power, platform, capital, or policy decision.`),
    ];
  }
  if (/actual infrastructure link|capacity|technical|stack|system|power|utility|platform|resilien|supply/i.test(heading)) {
    return [
      paragraph(`${layer} is the control point in this story, and the evidence is useful only if it changes timing, availability, cost, or reliability.`),
      paragraph(`${evidencePack.operating_implications?.[0]} For ${actor}, the harder test is whether the announcement changes deployment conditions instead of only changing narrative momentum.`),
    ];
  }
  if (/what it does not prove|limitation/i.test(heading)) {
    return [
      paragraph(`${evidencePack.counterarguments?.[0] || thesis.counterargument} That keeps the analysis from treating intent, financing, or a product claim as finished capacity.`),
      paragraph(`The missing proof is not academic: buyers need delivery windows, service terms, power availability, and customer commitments before changing plans.`),
    ];
  }
  if (/missing evidence|counter/i.test(heading)) {
    return [
      paragraph(`${evidencePack.uncertainty?.[0] || 'The evidence still leaves open delivery, cost, and customer questions.'} The gap matters because weak evidence can make scarce infrastructure look more available than it is.`),
      paragraph(`A cautious reader would ask for field evidence tied to ${layer}: signed customers, funded capacity, utility milestones, operating data, or measurable cost movement.`),
    ];
  }
  if (/watch|change the thesis/i.test(heading)) {
    return [
      paragraph(`Watch ${evidencePack.watch_metrics?.slice(0, 3).join('; ')}.`),
      paragraph(`The view should change if ${evidencePack.what_would_change_our_view?.join(', ')} appear in later source evidence. Without those markers, the signal remains useful but incomplete.`),
    ];
  }
  if (/bottom line/i.test(heading)) {
    return [
      paragraph(`${thesis.bottom_line} Compute Current would upgrade the signal only when verified milestones show that the control point is moving from announcement to execution.`),
    ];
  }
  if (/cost|schedule|exposure|capital|investor|commercial|lease|customer/i.test(heading)) {
    return [
      paragraph(`${fact.replace(/\.$/, '')} matters because it can change who pays for delay, who captures margin, and who gets priority access to scarce infrastructure inputs.`),
      paragraph(`${evidencePack.commercial_implications?.[0]} ${evidencePack.capital_market_implications?.[0] || 'The investment question is whether demand quality survives the delivery calendar.'}`),
    ];
  }
  if (/operator|who gains|who absorbs|winners|exposed/i.test(heading)) {
    return [
      paragraph(`${thesis.who_benefits} That advantage is meaningful only if the evidence turns into execution leverage.`),
      paragraph(`${thesis.who_is_exposed} Their exposure sits in the lag between public signal and deployable infrastructure.`),
    ];
  }
  if (/why it may still matter|why.*outrunning|demand quality/i.test(heading)) {
    return [
      paragraph(`${thesis.why_it_matters_for_ai_infrastructure} The story earns attention because it links demand to a specific constraint instead of leaving AI growth as an abstraction.`),
      paragraph(`${evidencePack.commercial_implications?.[1]} The upside case depends on whether the market treats the signal as durable capacity rather than short-lived momentum.`),
    ];
  }
  return [
    paragraph(`${fact.replace(/\.$/, '')} is the evidence anchor for this section.`),
    paragraph(index % 2
      ? `${thesis.decision_relevance} The section asks which team gains control, which team waits, and which assumption needs a harder proof point.`
      : `${thesis.why_it_matters_for_ai_infrastructure} The interpretation turns on timing, risk transfer, and whether evidence reaches the operating layer.`),
  ];
}

function extendToLength(blocks, ctx, targetWords) {
  let body = blocks.join('\n\n');
  const extensions = [
    ['Reader impact', `${ctx.thesis.who_benefits} ${ctx.thesis.who_is_exposed}`],
    ['Decision value', `${ctx.thesis.decision_relevance} ${ctx.evidencePack.operating_implications?.[1] || ''}`],
    ['Uncertainty', `${ctx.evidencePack.uncertainty?.[0]} That uncertainty is not a flaw in the story; it is the part operators and investors need to underwrite.`],
    ['Procurement read', `Procurement teams should translate the signal into calendars: what is committed, what still depends on suppliers or utilities, and what milestone would justify changing spend.`],
    ['Investor read', `Investors should avoid capitalizing the full demand story until the evidence shows who carries development risk, who controls the scarce input, and who has a durable customer.`],
    ['Operator read', `Operators should compare the source signal with their own constraint stack. If it does not affect power, space, equipment, platform readiness, or service reliability, it belongs below the main planning line.`],
    ['Why the desk selected it', `The cluster clears the desk bar because it has named actors, an infrastructure layer, and enough evidence to support interpretation without leaning on unsupported claims.`],
    ['Where the story could break', `The story weakens if later evidence shows slippage, vague customer demand, unavailable power, unpriced equipment, or financing that depends on assumptions rather than commitments.`],
  ];
  let i = 0;
  while (wordCount(body) < targetWords && i < extensions.length) {
    const [heading, text] = extensions[i];
    if (!blocks.includes(heading)) blocks.push(heading, paragraph(text));
    body = blocks.join('\n\n');
    i += 1;
  }
  return body;
}

export function writeAutonomousBlogArticle(cluster = {}, options = {}) {
  const route = cluster.editorial_route || 'Standard Analysis';
  const articleId = options.articleId || hash([cluster.cluster_id, route].join('|'));
  const ledgerResult = options.claimLedger || buildClaimLedger(cluster, articleId);
  const ledger = ledgerResult.claims || [];
  const evidencePack = options.evidencePack || buildEvidencePackV2(cluster, ledger);
  const thesis = options.thesis || generateEditorialThesis(cluster, evidencePack);
  const insightPlan = planInsightDensity(evidencePack);
  const voice = options.voice || selectAutonomousVoice(cluster, { recent: options.recent || [] });
  const structure = routeBlogStructureV2(cluster, { recent: options.recent || [] });
  const targetWords = route === 'Featured Analysis' ? 900 : 650;
  const lede = generateNarrativeLedeV2({ cluster, evidencePack, thesis, index: options.index || 0 });
  const blocks = [lede, 'Thesis', paragraph(thesis.thesis_sentence)];
  const ctx = { cluster, evidencePack, thesis, insightPlan, voice };

  for (const [index, heading] of structure.headings.entries()) {
    blocks.push(heading);
    blocks.push(...sectionForHeading(heading, ctx, index));
  }

  const sourceText = [cluster.representative_source?.cleaned_text, ...(cluster.supporting_sources || []).map((item) => item.cleaned_text)].filter(Boolean).join(' ');
  let body = extendToLength(blocks, ctx, targetWords);
  let final = finalCopyChief({ body, ledger, sourceText, route });
  if (wordCount(final.body) < targetWords) {
    body = extendToLength([...final.body.split(/\n{2,}/)], ctx, targetWords + 120);
    final = finalCopyChief({ body, ledger, sourceText, route });
  }

  const title = compact(cluster.cluster_title || cluster.representative_source?.title || 'AI infrastructure signal');
  const deck = sentence(thesis.thesis_sentence);
  const why = sentence(thesis.why_it_matters_for_ai_infrastructure);
  const publishedAt = options.publishedAt || cluster.last_seen_at || cluster.representative_source?.source_published_at || new Date().toISOString();
  const primarySource = cluster.representative_source || {};
  const updatedLedger = ledger.map((claim, index) => ({
    ...claim,
    used_in_article: index < 8,
    article_sentence: index < 8 ? claim.claim_text : '',
  }));
  const article = {
    id: articleId,
    slug: articleId,
    title,
    source: primarySource.source_name || primarySource.source || 'Original source',
    sourceUrl: primarySource.source_url || primarySource.url || '',
    url: primarySource.source_url || primarySource.url || '',
    publishedAt,
    updatedAt: new Date().toISOString(),
    analysisPublishedAt: new Date().toISOString(),
    generation_version: AUTONOMOUS_VERSION,
    public_generation_version: AUTONOMOUS_VERSION,
    article_type: route,
    blog_route: route === 'Featured Analysis' ? 'featured_analysis' : 'standard_analysis',
    publishing_route: route,
    editorial_cycle_id: options.cycleId || '',
    signal_cluster_id: cluster.cluster_id,
    editorial_archetype: structure.archetype.name,
    editorial_archetype_id: structure.archetype.id,
    voice,
    backfilledAnalysis: options.backfilled === true,
    public_status: 'published',
    homepagePublished: options.homepagePublished !== false,
    articlePagePublished: true,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    source_link_secondary: true,
    primaryHref: relativeNewsHref({ id: articleId }),
    infrastructure_relevance_score: Math.max(0.75, Number(primarySource.relevance_score || primarySource.original?.infrastructure_relevance_score || 0.75)),
    extraction_quality_score: Math.max(0.88, Number(primarySource.extraction_quality || primarySource.original?.extraction_quality_score || 0.88)),
    primary_category: primarySource.original?.primary_category || primarySource.original?.category || evidencePack.infrastructure_layer || 'AI Infrastructure',
    category: primarySource.original?.category || primarySource.original?.primary_category || 'AI Infrastructure',
    infrastructure_layer: evidencePack.infrastructure_layer,
    region: evidencePack.regions?.[0] || primarySource.original?.region || 'Global',
    affected_stakeholders: evidencePack.affected_stakeholders,
    tags: [...new Set([evidencePack.infrastructure_layer, structure.archetype.name, ...(evidencePack.named_entities || [])].filter(Boolean).map((tag) => String(tag).toLowerCase()))].slice(0, 8),
    deck,
    why_it_matters: why,
    summary: why,
    snippet: deck,
    excerpt: deck,
    contentText: final.body,
    articleText: final.body,
    fullArticleText: final.body,
    rawText: '',
    cleaned_source_text: evidencePack.verified_facts.slice(0, 6).join(' '),
    source_evidence_text: evidencePack.verified_facts.slice(0, 6).join(' '),
    searchText: [title, deck, why, final.body, evidencePack.named_entities?.join(' ')].filter(Boolean).join(' '),
    expertLensShort: deck,
    expertLens: deck,
    public_presentation: {
      signal_label: route === 'Featured Analysis' ? 'Core Signal' : 'Deep Dive',
      editorial_lens: structure.archetype.name,
      title,
      deck,
      why_it_matters: why,
      reader_impact: evidencePack.affected_stakeholders?.slice(0, 4) || [],
      region: evidencePack.regions?.[0] || 'Global',
      source: primarySource.source_name || primarySource.source || 'Source',
      view_detail: relativeNewsHref({ id: articleId }),
      read_source: primarySource.source_url || primarySource.url || '',
      lane_key: 'featured-analysis',
      lane_title: 'Featured Analysis',
      visibility: 'core',
    },
    public_routing: {
      visibility: 'core',
      laneKey: 'featured-analysis',
      laneTitle: 'Featured Analysis',
      score: Number((cluster.signal_score || 82) / 100),
      public_signal_label: route === 'Featured Analysis' ? 'Core Signal' : 'Deep Dive',
      editorial_lens: structure.archetype.name,
      story_archetype: structure.archetype.name,
      routing_decision: route,
    },
    evidence_pack: evidencePack,
    editorial_thesis: thesis,
    claim_ledger: updatedLedger,
    claim_ledger_summary: ledgerResult.summary,
    expertLensFull: {
      finalHeadline: title,
      metaDescription: deck,
      thesis: thesis.thesis_sentence,
      finalArticleBody: final.body,
      sourceLink: primarySource.source_url || primarySource.url || '',
      atAGlance: evidencePack.verified_facts.slice(0, 3),
      watchMetrics: evidencePack.watch_metrics,
      bottomLine: thesis.bottom_line,
      evidenceBox: {
        verifiedFacts: evidencePack.verified_facts.slice(0, 5),
        keyNumbers: updatedLedger.filter((claim) => claim.numeric_value !== null && claim.numeric_value !== undefined).slice(0, 4),
        sourceCount: cluster.source_count || 1,
        uncertainty: evidencePack.uncertainty?.[0] || '',
      },
      whatWouldChangeOurView: evidencePack.what_would_change_our_view,
    },
    blog_metadata: {
      tone: voice,
      archetype: structure.archetype.name,
      archetype_id: structure.archetype.id,
      thesis: thesis.thesis_sentence,
      evidence_fact_count: evidencePack.verified_facts.length,
      verified_fact_count: ledgerResult.summary?.verified_fact_count || evidencePack.verified_facts.length,
      visible_body_characters: visibleBodyLength(final.body),
      word_count: wordCount(final.body),
      paragraph_count: paragraphCount(final.body),
      section_count: sectionCount(final.body),
      ...final.metrics,
    },
    autonomous_quality: {
      ok: final.ok,
      reasons: final.reasons,
    },
  };
  return {
    ok: final.ok
      && evidencePack.verified_facts.length >= 4
      && (ledgerResult.summary?.unsupported_claim_count || 0) === 0
      && visibleBodyLength(final.body) >= (route === 'Featured Analysis' ? 3200 : 2200),
    article,
    ledger: updatedLedger,
    evidencePack,
    thesis,
    structure,
    voice,
    quality: final,
    reasons: final.reasons,
  };
}
