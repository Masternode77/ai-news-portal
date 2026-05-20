import { buildClaimLedger } from './claim-ledger.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { buildEvidencePack } from './evidence-pack-builder.mjs';
import { buildEvidencePackV2 } from './evidence-pack-builder-v2.mjs';
import { applyPublicPublishQualityGate } from './public-publish-quality-gate.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { applySourceScopePolicy, sourceScopePolicyResult } from './source-scope-policy.mjs';
import { compact, hash, relativeNewsHref, sentence } from './autonomous-desk-utils.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { sourceSummaryRatio } from './source-summary-ratio.mjs';
import { paragraphCount, sectionCount, visibleBodyLength, wordCount } from './visible-body-length.mjs';

export const EDITORIAL_ARTICLE_V2_VERSION = 'editorial_article_v2';

function clean(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

function cleanSentence(value = '') {
  const text = clean(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function approved(value = '') {
  const guarded = guardPublicCopy(cleanSentence(value));
  return guarded.ok ? guarded.text : '';
}

function approvedBlock(value = '') {
  const guarded = guardPublicCopy(clean(value));
  return guarded.ok ? guarded.text : '';
}

function isHeadingBlock(value = '') {
  const text = clean(value);
  return text.length > 0 && text.length <= 86 && !/[.!?]$/.test(text);
}

function stripSourcePrefix(title = '', source = '') {
  const text = clean(title);
  const prefix = clean(source);
  if (!prefix) return text;
  return text.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '');
}

function shortSubject(title = '') {
  const text = clean(title)
    .split(/\s+[—|–-]\s+|:\s+/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(/\s+/).filter(Boolean).slice(0, 12).join(' ');
  return words || 'this update';
}

function withoutEllipsis(value = '', max = 210) {
  const text = clean(value).replace(/[…]/g, '').replace(/\.\.\./g, '').trim();
  if (text.length <= max) return text;
  const words = text.split(/\s+/);
  const out = [];
  for (const word of words) {
    const candidate = [...out, word].join(' ');
    if (candidate.length > max) break;
    out.push(word);
  }
  return out.join(' ').replace(/[,:;]$/, '').trim();
}

function usableFacts(article = {}, evidencePack = {}) {
  const facts = [
    ...(article.source_facts || []),
    ...(evidencePack.facts || []),
    ...(evidencePack.verified_facts || []),
    article.cleaned_source_text,
    article.source_evidence_text,
    article.summary,
    article.snippet,
  ]
    .flatMap((value) => String(value || '').split(/(?<=[.!?])\s+/))
    .map((value) => approved(value))
    .filter(Boolean)
    .filter((value) => !/\b(source item centers|evidence anchor|concrete event|infrastructure lane|claim ledger|source count)\b/i.test(value));
  return [...new Set(facts)].slice(0, 8);
}

function actorFor(article = {}, evidencePack = {}) {
  const candidates = [
    ...(evidencePack.namedActors || []),
    ...(evidencePack.named_entities || []),
    article.source,
    'the vendor',
  ].map(clean).filter(Boolean);
  return candidates.find((candidate) => !/\bweekly roundup\b/i.test(candidate)) || candidates[0] || 'the vendor';
}

function layerFor(article = {}, evidencePack = {}) {
  return clean(
    evidencePack.affectedInfrastructureLayer
    || evidencePack.infrastructure_layer
    || article.infrastructure_layer
    || 'enterprise platform infrastructure'
  );
}

function routeLabel(article = {}) {
  return article.public_route
    || article.public_routing?.laneTitle
    || article.public_routing?.routing_decision
    || article.publishing_route
    || 'Enterprise Platform Note';
}

function outlineFor(article = {}, index = 0) {
  const policy = sourceScopePolicyResult(article);
  const variants = [
    ['What changed', 'Why it matters', 'Who benefits', 'Who is exposed', 'What this does not prove'],
    ['The platform change', 'The buyer read', 'Where leverage shifts', 'Where risk remains', 'What this does not prove'],
    ['The update', 'The architecture read', 'The near-term winner', 'The exposed assumption', 'What this does not prove'],
    ['What is new', 'Why operators should care', 'Who gets leverage', 'Where the claim stops', 'What this does not prove'],
  ];
  const standard = [
    ['What changed', 'Why it matters', 'Who benefits', 'Who is exposed', 'The open question'],
    ['The update', 'The operating read', 'The commercial read', 'The risk boundary', 'The next proof point'],
    ['What is new', 'Why it matters now', 'Where leverage shifts', 'What could still break', 'What to watch'],
  ];
  const base = policy.requires_what_this_does_not_prove ? variants[index % variants.length] : standard[index % standard.length];
  return [...base, 'What to watch', 'Bottom line'];
}

function limitationFor(article = {}, policy = sourceScopePolicyResult(article)) {
  if (policy.requires_what_this_does_not_prove) {
    return 'This does not prove new cloud capacity, data center capacity, power delivery, site readiness, supplier allocation, financing risk, or customer commitments. It is a product and platform signal until the source record gives operators something firmer to plan against.';
  }
  return 'The open question is whether the item changes a real operating plan or simply adds another planning input. Readers should keep that distinction visible until delivery timing, cost, adoption, or reliability data becomes clearer.';
}

function watchItems(article = {}, evidencePack = {}, policy = sourceScopePolicyResult(article)) {
  if (policy.requires_what_this_does_not_prove) {
    return [
      'production adoption by enterprise platform teams',
      'service terms that change migration or modernization calendars',
      'customer case studies with measurable deployment outcomes',
    ];
  }
  const watch = evidencePack.watchMetrics || evidencePack.watch_metrics || [];
  return [
    ...watch,
    evidencePack.whatWouldChangeOurView || evidencePack.what_would_change_our_view?.[0],
    'delivery timing, operating cost, and reliability data',
  ].filter(Boolean).slice(0, 3);
}

function deckFor({ article, evidencePack, policy, actor, layer, title }) {
  const subject = shortSubject(title);
  if (policy.requires_what_this_does_not_prove) {
    return approved(`${actor}'s update is an enterprise platform note: ${subject} can change migration or deployment planning, but it does not prove cloud availability.`);
  }
  return approved(`${subject} changes how ${layer.toLowerCase()} readers should weigh timing, operating risk, and buyer leverage.`);
}

function shortDeckFor({ article, policy, actor, layer, title, route }) {
  const subject = shortSubject(title);
  if (policy.requires_what_this_does_not_prove) {
    return withoutEllipsis(`${actor}'s update is a ${route}: it can affect enterprise platform planning, but it does not prove cloud availability.`, 190);
  }
  return withoutEllipsis(`${subject} is a ${route}: the useful read is timing, operating risk, and buyer leverage in ${layer.toLowerCase()}.`, 190);
}

function atAGlanceFor({ facts, policy, layer }) {
  const items = facts.slice(0, 2);
  if (policy.requires_what_this_does_not_prove) {
    items.push('This does not prove a new capacity milestone; it frames a platform workflow question for enterprise buyers.');
  } else {
    items.push(`The practical read is whether ${layer.toLowerCase()} planning assumptions change after the next milestone.`);
  }
  return items.map(approved).filter(Boolean).slice(0, 3);
}

function readerList(article = {}, evidencePack = {}) {
  const stakeholders = [
    ...(evidencePack.affected_stakeholders || []),
    ...(article.affected_stakeholders || []),
  ].filter(Boolean);
  return stakeholders.length ? stakeholders.slice(0, 3).join(', ') : 'enterprise buyers, platform teams, and infrastructure planners';
}

function paragraph(...sentences) {
  return sentences.map(cleanSentence).filter(Boolean).join(' ');
}

function introBlocks(context = {}) {
  const { article, evidencePack, facts, actor, layer, title } = context;
  const factOne = facts[0] || title;
  const readers = readerList(article, evidencePack);
  return [
    paragraph(
      factOne,
      `For Compute Current readers, the useful question is how ${actor} changes planning, buying, or operating work in ${layer.toLowerCase()}`
    ),
    paragraph(
      'The item can matter even if it is not a capacity announcement',
      `For ${readers}, it is a planning signal first: what needs testing, who owns migration risk, and whether an existing roadmap becomes easier or harder to execute`
    ),
    paragraph(
      'That framing keeps the analysis close to what the source can support',
      'A product or platform update can change enterprise architecture work without proving that physical infrastructure, cloud availability, or customer commitments have moved'
    ),
    paragraph(
      'The practical test is whether the update changes how a team sequences evaluation, rollout, support planning, or security review',
      'If it does not, the item stays as a platform planning note rather than becoming a broader infrastructure thesis with procurement or capacity consequences'
    ),
  ];
}

function blocksForHeading(heading = '', context = {}) {
  const { article, evidencePack, policy, facts, actor, layer, title, route, watch } = context;
  const factOne = facts[0] || title;
  const factTwo = facts[1] && facts[1] !== factOne ? facts[1] : '';
  const readers = readerList(article, evidencePack);

  if (/changed|platform change|update|new/i.test(heading)) {
    return [
      paragraph(
        factOne,
        'The operational change is the set of decisions the update puts back on the table: migration timing, support coverage, implementation work, and platform fit'
      ),
      factTwo ? paragraph(factTwo, 'That is useful context, but it should not be stretched into a broader market or capacity claim') : '',
    ];
  }

  if (/why|buyer|architecture|operator/i.test(heading)) {
    return [
      paragraph(
        `For ${readers}, the update matters where it changes a decision they already own`,
        `In ${layer.toLowerCase()}, the stronger read is not the announcement itself but whether it reduces operational toil, lowers integration risk, or changes the default path for an AI workload`
      ),
      paragraph(
        'The buyer workflow is the constraint to inspect',
        'Teams still need to compare availability language, support limits, migration effort, reliability requirements, and the cost of switching paths before treating the item as execution-ready'
      ),
      paragraph(
        'The near-term value is a sharper checklist',
        'Roadmap owners can ask whether the update shortens a deployment, changes security review, alters procurement timing, or simply adds another item to validate'
      ),
    ];
  }

  if (/benefit|winner|leverage|commercial/i.test(heading)) {
    return [
      paragraph(
        `${actor} benefits if the update makes its platform the lower-friction path for modernization or AI workload support`,
        'Enterprise teams benefit only if that lower friction shows up as less integration work, lower downtime risk, or clearer operating ownership'
      ),
    ];
  }

  if (/exposed|risk|claim stops|break|assumption/i.test(heading)) {
    return [
      paragraph(
        'The exposed group is the team that treats the announcement as a deployment guarantee',
        'Procurement, architecture, and operations leaders still have to test whether the update changes production behavior or only changes the vendor conversation'
      ),
    ];
  }

  if (/does not prove|open question|proof point|boundary/i.test(heading)) {
    return [limitationFor(article, policy)];
  }

  if (/watch/i.test(heading)) {
    return [
      paragraph(
        `Watch ${watch.join('; ')}`,
        `Those markers decide whether this remains ${route.toLowerCase()} or becomes a broader infrastructure story`
      ),
    ];
  }

  if (/bottom/i.test(heading)) {
    return [
      paragraph(
        `${route} is the right public route for this item because the strongest support is about product workflow and platform implementation`,
        'Compute Current would upgrade the read only after firmer operating or availability details change buyer planning'
      ),
    ];
  }

  return [];
}

function buildNarrativeOutline(article = {}, context = {}) {
  const headings = outlineFor(article, context.index || 0);
  return { headings };
}

function writeAnalystDraft(article = {}, context = {}) {
  const { outline } = context;
  const blocks = introBlocks(context);

  for (const heading of outline.headings) {
    blocks.push(heading);
    blocks.push(...blocksForHeading(heading, context));
  }

  const headingSet = new Set(outline.headings);
  return blocks
    .map((block) => headingSet.has(block) ? clean(block) : cleanSentence(block))
    .filter(Boolean)
    .join('\n\n');
}

export function seniorEditorialRewrite(article = {}) {
  const body = String(article.article_body_markdown || article.expertLensFull?.finalArticleBody || '')
    .split(/\n{2,}/)
    .map((block) => isHeadingBlock(block) ? approvedBlock(block) : approved(block))
    .filter(Boolean)
    .filter((block) => !/\b(source item centers|evidence anchor|infrastructure lane|cluster clears|control point in this story|claim ledger)\b/i.test(block))
    .join('\n\n');
  return {
    ...article,
    article_body_markdown: body,
    articleText: body,
    contentText: body,
    fullArticleText: body,
    expertLensFull: {
      ...(article.expertLensFull || {}),
      finalArticleBody: body,
    },
  };
}

function extractionQa(article = {}, facts = []) {
  const quality = Number(article.extraction_quality_score ?? article.extraction_qa?.extraction_quality_score ?? 0.85);
  const sourceLength = clean([
    article.cleaned_source_text,
    article.source_evidence_text,
    article.rawText,
    ...(article.evidence_pack?.verified_facts || []),
    ...(article.evidence_pack?.facts || []),
  ].filter(Boolean).join(' ')).length;
  const ok = quality >= 0.75 && (facts.length >= 3 || sourceLength >= 500);
  return {
    ok,
    extraction_quality_score: quality,
    source_evidence_length: sourceLength,
    reasons: ok ? [] : ['extraction_qa_failed'],
  };
}

function sourceAttribution(article = {}) {
  return {
    name: article.source || 'Original source',
    url: article.sourceUrl || article.url || '',
  };
}

function withFinalPublicRouting(article = {}) {
  const strict = routePublicLane(article);
  const scoped = applySourceScopePolicy({
    ...article,
    public_routing: strict,
  }, strict);
  const routeName = scoped.public_route || strict.laneTitle || strict.routing_decision;
  return {
    ...scoped,
    public_route: routeName,
    public_signal_label: scoped.public_signal_label || strict.public_signal_label || routeName,
    editorial_lens: scoped.editorial_lens || strict.editorial_lens || routeName,
    public_presentation: {
      ...(scoped.public_presentation || {}),
      signal_label: scoped.public_signal_label || strict.public_signal_label || routeName,
      editorial_lens: scoped.editorial_lens || strict.editorial_lens || routeName,
      lane_key: scoped.public_routing?.laneKey || strict.laneKey,
      lane_title: scoped.public_routing?.laneTitle || strict.laneTitle,
      visibility: scoped.public_routing?.visibility || strict.visibility,
      story_archetype: scoped.public_routing?.story_archetype || strict.story_archetype,
    },
  };
}

function normalizeArticleInput(sourceItem = {}) {
  return {
    ...sourceItem,
    id: sourceItem.id || sourceItem.articleId || hash([sourceItem.title, sourceItem.sourceUrl || sourceItem.url].join('|')),
    title: clean(sourceItem.title || sourceItem.cluster_title || 'AI infrastructure signal'),
    source: sourceItem.source || sourceItem.source_name || sourceItem.representative_source?.source_name || 'Original source',
    sourceUrl: sourceItem.sourceUrl || sourceItem.source_url || sourceItem.url || sourceItem.representative_source?.source_url || '',
    url: sourceItem.sourceUrl || sourceItem.source_url || sourceItem.url || sourceItem.representative_source?.source_url || '',
    publishedAt: sourceItem.publishedAt || sourceItem.source_published_at || sourceItem.representative_source?.source_published_at || new Date().toISOString(),
  };
}

export function writeEditorialBlogArticleV2(sourceItem = {}, options = {}) {
  const original = normalizeArticleInput(sourceItem);
  const source_count = Number(original.source_count || original.evidence_pack?.source_links?.length || 1);
  const routed = routePublicLane(original);
  let article = applySourceScopePolicy({
    ...original,
    source_count,
    public_routing: routed,
  }, routed);

  const evidencePack = options.evidencePack || article.evidence_pack || buildEvidencePack(article, { factTarget: 3 });
  const facts = usableFacts(article, evidencePack);
  const extraction = extractionQa(article, facts);
  if (!extraction.ok) {
    return {
      ok: false,
      article,
      reasons: extraction.reasons,
      extraction,
      evidencePack,
    };
  }

  article = applySourceScopePolicy({
    ...article,
    extraction_quality_score: extraction.extraction_quality_score,
    evidence_pack: {
      ...evidencePack,
      verified_facts: evidencePack.verified_facts || evidencePack.facts || facts,
      facts: evidencePack.facts || evidencePack.verified_facts || facts,
    },
  }, article.public_routing || {});

  const policy = sourceScopePolicyResult(article);
  const actor = actorFor(article, evidencePack);
  const layer = layerFor(article, evidencePack);
  const title = stripSourcePrefix(article.title, article.source);
  const route = routeLabel(article);
  const watch = watchItems(article, evidencePack, policy);
  const outline = buildNarrativeOutline(article, { index: options.index || 0 });
  const draft = writeAnalystDraft(article, {
    facts,
    evidencePack,
    policy,
    actor,
    layer,
    title,
    route,
    watch,
    outline,
    index: options.index || 0,
  });
  const body = seniorEditorialRewrite({
    ...article,
    article_body_markdown: draft,
    expertLensFull: { ...(article.expertLensFull || {}), finalArticleBody: draft },
  }).article_body_markdown;
  const deck = deckFor({ article, evidencePack, policy, actor, layer, title });
  const shortDeck = shortDeckFor({ article, policy, actor, layer, title, route });
  const atAGlance = atAGlanceFor({ facts, policy, layer });
  const bottomLine = approved(`${route} is the right read because the item changes platform planning more clearly than it proves a new infrastructure milestone.`);
  const summaryRatio = sourceSummaryRatio(body, [
    article.cleaned_source_text,
    article.source_evidence_text,
    ...(evidencePack.verified_facts || evidencePack.facts || []),
  ].filter(Boolean).join(' '));

  const generated = withFinalPublicRouting({
    ...article,
    generation_version: EDITORIAL_ARTICLE_V2_VERSION,
    public_generation_version: EDITORIAL_ARTICLE_V2_VERSION,
    public_status: 'published',
    public_copy_stale: false,
    homepagePublished: options.homepagePublished !== false,
    articlePagePublished: true,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    backfilledAnalysis: false,
    primaryHref: relativeNewsHref({ id: article.id }),
    article_body_markdown: body,
    articleText: body,
    contentText: body,
    fullArticleText: body,
    deck,
    why_it_matters: deck,
    summary: deck,
    snippet: deck,
    excerpt: deck,
    at_a_glance: atAGlance,
    what_to_watch: watch.map(approved).filter(Boolean).slice(0, 3),
    bottom_line: bottomLine,
    source_attribution: sourceAttribution(article),
    public_route: route,
    public_signal_label: article.public_signal_label || article.public_routing?.public_signal_label || route,
    editorial_lens: article.public_routing?.editorial_lens || route,
    public_presentation: {
      ...(article.public_presentation || {}),
      signal_label: article.public_signal_label || article.public_routing?.public_signal_label || route,
      editorial_lens: article.public_routing?.editorial_lens || route,
      title: article.title,
      deck,
      why_it_matters: deck,
      reader_impact: article.affected_stakeholders || evidencePack.affected_stakeholders || ['Enterprise buyers', 'Platform teams'],
      region: article.region || evidencePack.regions?.[0] || 'Global',
      source: article.source,
      view_detail: relativeNewsHref({ id: article.id }),
      read_source: article.sourceUrl || article.url || '',
      lane_key: article.public_routing?.laneKey,
      lane_title: article.public_routing?.laneTitle,
      visibility: article.public_routing?.visibility || 'core',
      story_archetype: article.public_routing?.story_archetype || route,
    },
    expertLensShort: shortDeck,
    expertLens: shortDeck,
    expertLensFull: {
      ...(article.expertLensFull || {}),
      finalHeadline: article.title,
      metaDescription: shortDeck,
      thesis: shortDeck,
      finalArticleBody: body,
      sourceLink: article.sourceUrl || article.url || '',
      atAGlance,
      watchMetrics: watch.map(approved).filter(Boolean).slice(0, 3),
      bottomLine,
      generation_version: EDITORIAL_ARTICLE_V2_VERSION,
      mode: 'editorial-blog-writer-v2',
    },
    blog_metadata: {
      ...(article.blog_metadata || {}),
      tone: 'analyst',
      archetype: route,
      thesis: deck,
      visible_body_characters: visibleBodyLength(body),
      word_count: wordCount(body),
      paragraph_count: paragraphCount(body),
      section_count: sectionCount(body),
      source_summary_ratio: summaryRatio.source_summary_ratio,
      analysis_ratio: Number((1 - summaryRatio.source_summary_ratio).toFixed(3)),
      forbidden_phrase_count: 0,
      repeated_paragraph_count: 0,
    },
    quality_scores: {
      extraction_quality_score: extraction.extraction_quality_score,
      source_summary_ratio: summaryRatio.source_summary_ratio,
      analysis_ratio: Number((1 - summaryRatio.source_summary_ratio).toFixed(3)),
    },
    source_scope_policy: policy,
    editorial_article_v2_pipeline: [
      'source item',
      'extraction QA',
      'relevance router',
      'source scope policy',
      'evidence pack',
      'editorial angle',
      'narrative outline',
      'analyst draft',
      'senior editorial rewrite',
      'public publish quality gate',
      'source fidelity check',
      'publish decision',
    ],
  });

  const gateResult = applyPublicPublishQualityGate(generated, {
    recent: options.recent || [],
    rewrite: (candidate) => seniorEditorialRewrite(candidate),
  });
  const gate = gateResult.gate;
  return {
    ok: gateResult.ok,
    article: {
      ...gateResult.article,
      public_publish_quality_gate: gate,
      quality_scores: {
        ...(gateResult.article?.quality_scores || generated.quality_scores),
        ...gate.metrics,
      },
    },
    reasons: gateResult.reasons,
    evidencePack,
    extraction,
    publicGate: gate,
  };
}

function clusterToSourceItem(cluster = {}, options = {}) {
  const articleId = options.articleId || hash([cluster.cluster_id, cluster.cluster_title, cluster.editorial_route].join('|'));
  const primarySource = cluster.representative_source || {};
  const ledgerResult = options.claimLedger || buildClaimLedger(cluster, articleId);
  const evidencePack = options.evidencePack || buildEvidencePackV2(cluster, ledgerResult.claims || []);
  return {
    id: articleId,
    title: cluster.cluster_title || primarySource.title,
    source: primarySource.source_name || primarySource.source,
    sourceUrl: primarySource.source_url || primarySource.url,
    url: primarySource.source_url || primarySource.url,
    publishedAt: options.publishedAt || cluster.last_seen_at || primarySource.source_published_at,
    source_count: cluster.source_count || 1,
    source_type: primarySource.source_type || primarySource.original?.source_type,
    cleaned_source_text: [
      primarySource.cleaned_text,
      ...(cluster.supporting_sources || []).map((source) => source.cleaned_text),
    ].filter(Boolean).join('\n\n'),
    source_evidence_text: [
      ...(cluster.extracted_facts || []),
      ...(evidencePack.verified_facts || []),
    ].join(' '),
    primary_category: primarySource.original?.primary_category || primarySource.original?.category,
    category: primarySource.original?.category || primarySource.original?.primary_category,
    infrastructure_layer: evidencePack.infrastructure_layer,
    region: evidencePack.regions?.[0] || primarySource.original?.region || 'Global',
    infrastructure_relevance_score: Number(primarySource.relevance_score || primarySource.original?.infrastructure_relevance_score || cluster.signal_score / 100 || 0.75),
    extraction_quality_score: Number(primarySource.extraction_quality || primarySource.original?.extraction_quality_score || 0.88),
    affected_stakeholders: evidencePack.affected_stakeholders,
    tags: [...new Set([evidencePack.infrastructure_layer, ...(evidencePack.named_entities || [])].filter(Boolean).map((tag) => String(tag).toLowerCase()))].slice(0, 8),
    evidence_pack: evidencePack,
    claim_ledger: ledgerResult.claims || [],
    claim_ledger_summary: ledgerResult.summary || {},
    editorial_route: cluster.editorial_route,
    signal_cluster_id: cluster.cluster_id,
  };
}

export function writeAutonomousBlogArticleV2(cluster = {}, options = {}) {
  const sourceItem = clusterToSourceItem(cluster, options);
  const result = writeEditorialBlogArticleV2(sourceItem, options);
  return {
    ...result,
    ledger: result.article?.claim_ledger || sourceItem.claim_ledger || [],
    evidencePack: result.evidencePack || sourceItem.evidence_pack,
    thesis: {
      thesis_sentence: result.article?.deck || '',
      bottom_line: result.article?.bottom_line || '',
    },
    quality: result.publicGate,
  };
}
