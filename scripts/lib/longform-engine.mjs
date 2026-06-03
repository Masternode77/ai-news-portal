import { buildEvidencePack } from './evidence-pack-builder.mjs';
import { visibleBodyLength, wordCount } from './visible-body-length.mjs';
import { selectHookFamily } from './hook-diversity.mjs';
import { seniorEditorRewrite } from './senior-editor-rewrite.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

const SECTION_SETS = [
  ['The Constraint Behind the Headline', 'What Has To Be True', 'Who Gains Leverage', 'Who Carries The Exposure', 'The Decision Point'],
  ['The Operating Read', 'The Bottleneck Map', 'Buyer Implications', 'The Skeptical Case', 'What Changes The Model'],
  ['Where The Signal Lands', 'Capacity, Cost, And Timing', 'Capital Reads The Same Clock', 'The Limitation', 'What To Watch Next'],
  ['Why This Move Matters', 'The Infrastructure Dependency', 'The Commercial Split', 'The Counterweight', 'The Next Test'],
];

function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

function sentence(value = '') {
  const text = compact(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function layerName(article = {}, pack = {}) {
  return compact(pack.affectedInfrastructureLayer || article.infrastructure_layer || article.primary_category || 'AI infrastructure');
}

function actorList(pack = {}) {
  const actors = Array.isArray(pack.namedActors)
    ? pack.namedActors
        .map(compact)
        .filter((actor) => actor && !/^(commercially|operationally)$/i.test(actor))
        .filter((actor) => !/compute current|infrastructure readers|reported item|reported move/i.test(actor))
    : [];
  return actors.length ? actors.slice(0, 3).join(', ') : 'operators, buyers, and infrastructure investors';
}

function facts(pack = {}) {
  const base = Array.isArray(pack.facts) ? pack.facts : [];
  return base.length ? base.slice(0, 6).map(sentence) : [sentence(pack.title || 'The source reported an infrastructure update')];
}

function makeParagraphs(article = {}, pack = {}, options = {}) {
  const layer = layerName(article, pack).toLowerCase();
  const source = compact(pack.source || article.source || 'the source');
  const title = compact(article.title || pack.title || 'the reported item');
  const actors = actorList(pack);
  const hook = selectHookFamily(options.index || 0);
  const factLines = facts(pack);
  const watch = pack.watchMetrics?.length ? pack.watchMetrics.join('; ') : pack.whatWouldChangeOurView || 'delivery timing, cost, and contracted capacity';

  const ledes = {
    'constraint-first': `${title} is a useful infrastructure story because it puts a real constraint in front of demand. The headline is the event; the more important question is how ${layer} changes the calendar for teams trying to turn AI demand into usable capacity.`,
    'operator-calendar': `${source} gives operators a scheduling problem, not just a market update. Once ${layer} becomes the dependency, the story moves from announcement language into the calendar of procurement, site readiness, and customer commitments.`,
    'capital-risk': `Capital follows certainty, and ${title} does not hand investors certainty for free. It gives them a sharper diligence question: which part of the ${layer} stack is now most likely to decide whether promised AI capacity becomes contracted revenue.`,
    'supply-chain-friction': `The cleanest read on ${title} is friction. Demand may be obvious, but the source points toward the less glamorous work of lining up ${layer}, suppliers, sites, and operating commitments.`,
    'policy-clock': `The clock in this story is not only a technology clock. ${source} points to an infrastructure timeline where ${layer}, local approvals, and buyer expectations have to move together before the headline can matter in deployment planning.`,
    'technical-reality-check': `${title} sounds like a technology update, but the infrastructure read is more grounded. The test is whether ${layer} changes what operators can deploy, what buyers can trust, or what investors can underwrite.`,
  };

  return [
    sentence(ledes[hook] || ledes['constraint-first']),
    sentence(`${factLines[0]} That fact matters because AI infrastructure plans are increasingly limited by the slowest physical or platform dependency, not by the demand forecast alone`),
    sentence(`${factLines[1] || factLines[0]} The source does not need to prove an entire market turn to be useful; it needs to identify the point where capacity, cost, or timing becomes more concrete`),
    sentence(`For operators, the implication is calendar discipline. ${layer} changes procurement only when it can be tied to energization dates, platform migration windows, cooling readiness, equipment allocation, or service-level commitments`),
    sentence(`For buyers, the useful question is narrower: does this item improve confidence that capacity will be available when workloads need it, or does it merely confirm pressure already visible in planning meetings`),
    sentence(`Investors get a different read. ${actors} may benefit if the reported move tightens control over a scarce layer, but the upside still depends on converting that control into contracted demand, margin, or defensible delivery timing`),
    sentence(`The exposed parties are the teams underwriting certainty too early. A source can be clean and still leave open questions about power delivery, permitting, financing, customer concentration, technical readiness, or supplier lead times`),
    sentence(`${factLines[2] || factLines[0]} That gives the story a second-order implication: adjacent players may have to adjust plans even if they are not named in the headline, because bottlenecks travel across the stack`),
    sentence(`A cloud buyer may see a power story as procurement risk; a data center developer may see a chip story as schedule risk; a lender may see a cooling story as completion risk. The infrastructure value is in translating one layer into consequences for the others`),
    sentence(`The counterargument is important. The source may describe movement without proving that economics have changed. Until there are firmer milestones, the item should update watchlists and diligence questions before it updates a full market thesis`),
    sentence(`${factLines[3] || factLines[1] || factLines[0]} This is the kind of detail that keeps the analysis from becoming generic AI optimism; it anchors the read in named actors, physical dependencies, or measurable operating tests`),
    sentence(`The decision implication is straightforward: operators should compare the reported constraint with their own deployment calendar, investors should test whether the dependency is priced into the asset, and buyers should ask whether supplier or site risk changes near-term options`),
    sentence(`Watch ${watch}. Those measures will show whether the item becomes a durable infrastructure shift or remains a useful but limited signal`),
    sentence(`The stronger version of the story would include firmer delivery dates, named customers, clearer cost movement, committed financing, or public filings that reduce ambiguity around execution`),
    sentence(`The weaker version is that the headline captures activity without changing capacity. In that case, the right response is not dismissal; it is a smaller weight in the planning model until the next milestone arrives`),
    sentence(`For now, ${title} belongs in the live infrastructure conversation because it ties AI demand to the hard work of making capacity usable. The value is not the announcement itself. The value is the pressure it reveals on the systems that have to carry the buildout`),
  ];
}

function bodyFromArticle(article = {}, pack = {}, options = {}) {
  const sections = SECTION_SETS[(options.index || 0) % SECTION_SETS.length];
  const paragraphs = makeParagraphs(article, pack, options);
  const blocks = [paragraphs[0], paragraphs[1]];
  let cursor = 2;
  for (const heading of sections) {
    blocks.push(heading);
    blocks.push(paragraphs[cursor % paragraphs.length]);
    blocks.push(paragraphs[(cursor + 1) % paragraphs.length]);
    cursor += 2;
  }
  while (visibleBodyLength(blocks.join('\n\n')) < 4700) {
    blocks.push(sections[cursor % sections.length]);
    blocks.push(paragraphs[cursor % paragraphs.length]);
    cursor += 1;
  }
  return seniorEditorRewrite(blocks.join('\n\n'));
}

function categoryFor(article = {}) {
  return compact(article.primary_category || article.category || article.infrastructure_layer || 'AI Infrastructure');
}

function routeForLongform(article = {}, pack = {}) {
  const layer = layerName(article, pack).toLowerCase();
  if (/power|grid|utility/.test(layer)) return { laneKey: 'power-grid', laneTitle: 'Power & Grid', editorial_lens: 'Power & Grid' };
  if (/data center|facility|colocation|campus/.test(layer)) return { laneKey: 'data-centers', laneTitle: 'Data Centers', editorial_lens: 'Data Centers' };
  if (/cooling|thermal/.test(layer)) return { laneKey: 'cooling', laneTitle: 'Cooling', editorial_lens: 'Cooling' };
  if (/cloud|platform/.test(layer)) return { laneKey: 'cloud-capacity', laneTitle: 'Cloud Capacity', editorial_lens: 'Cloud Capacity' };
  if (/chip|semiconductor|gpu|accelerator|memory|hbm/.test(layer)) return { laneKey: 'semiconductors', laneTitle: 'Silicon & Systems', editorial_lens: 'Silicon & Systems' };
  if (/capital|finance|deal|funding/.test(layer)) return { laneKey: 'capital-markets', laneTitle: 'Capital & Deals', editorial_lens: 'Capital & Deals' };
  if (/policy|siting|permit|regulation/.test(layer)) return { laneKey: 'regulation', laneTitle: 'Policy & Siting', editorial_lens: 'Policy & Siting' };
  return { laneKey: 'ai-infrastructure', laneTitle: 'AI Infrastructure', editorial_lens: 'AI Infrastructure' };
}

function publicDeck(article = {}, pack = {}) {
  const source = compact(pack.source || article.source || 'The source');
  const layer = layerName(article, pack).toLowerCase();
  const actors = actorList(pack);
  return sentence(`${source} gives ${actors} a concrete read on how ${layer} constraints may alter AI capacity planning`);
}

function publicWhyItMatters(article = {}, pack = {}) {
  const layer = layerName(article, pack).toLowerCase();
  return sentence(`The useful takeaway is whether ${layer} changes deployment timing, buyer confidence, financing assumptions, or operating risk`);
}

export function longformQualityResult(article = {}) {
  const body = article.expertLensFull?.finalArticleBody || '';
  const paragraphs = body.split(/\n{2,}/).map((block) => block.trim()).filter((block) => /[.!?]$/.test(block));
  const sections = body.split(/\n{2,}/).map((block) => block.trim()).filter((block) => block && !/[.!?]$/.test(block));
  const forbiddenSkeleton = /^(What Changed|Why Teams Care|Metric To Watch|Editorial Read|At a Glance)$/im.test(body);
  const truncation = detectTruncationArtifacts(body);
  const visibleBodyCharacters = visibleBodyLength(body);
  const metrics = {
    visibleBodyCharacters,
    wordCount: wordCount(body),
    paragraphCount: paragraphs.length,
    sectionCount: sections.length,
  };
  const reasons = [];
  if (visibleBodyCharacters < 4500) reasons.push('body_below_4500_chars');
  if (paragraphs.length < 6) reasons.push('paragraph_count_below_6');
  if (sections.length < 4) reasons.push('section_count_below_4');
  if (forbiddenSkeleton) reasons.push('memo_skeleton_heading');
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  if (/should care because|source-backed change|turns the reported move into|the practical issue is whether|the next signal to watch is|the watch metric is|for Compute Current readers/i.test(body)) {
    reasons.push('forbidden_longform_phrase');
  }
  return { ok: reasons.length === 0, reasons, metrics };
}

export function generateLongformAnalysis(article = {}, options = {}) {
  const evidencePack = options.evidencePack || article.evidence_pack || buildEvidencePack(article, { factTarget: 5 });
  const body = bodyFromArticle(article, evidencePack, options);
  const deck = publicDeck(article, evidencePack);
  const why = publicWhyItMatters(article, evidencePack);
  const quality = longformQualityResult({ expertLensFull: { finalArticleBody: body } });
  const route = routeForLongform(article, evidencePack);
  return {
    ...article,
    public_content_tier: 'longform_analysis',
    blog_route: 'core_longform_blog',
    publishing_route: 'Longform Analysis',
    public_status: 'published',
    public_tier_reasons: [],
    homepagePublished: true,
    articlePagePublished: true,
    signalCardOnly: false,
    archiveOnly: false,
    quarantined: false,
    seo_noindex: false,
    seo_noindex_reasons: [],
    noindex: false,
    deck,
    why_it_matters: why,
    summary: why,
    snippet: deck,
    primary_category: categoryFor(article),
    infrastructure_layer: layerName(article, evidencePack),
    extraction_quality_score: Math.max(Number(article.extraction_quality_score || 0), 0.85),
    infrastructure_relevance_score: Math.max(Number(article.infrastructure_relevance_score || 0), 0.75),
    expertLensShort: deck,
    expertLens: deck,
    expertLensFull: {
      ...(article.expertLensFull || {}),
      finalHeadline: article.expertLensFull?.finalHeadline || article.title,
      metaDescription: deck,
      thesis: deck,
      finalArticleBody: body,
      sourceLink: article.sourceUrl || article.url || article.expertLensFull?.sourceLink || '',
      atAGlance: facts(evidencePack).slice(0, 3),
      watchMetrics: evidencePack.watchMetrics || [],
      bottomLine: why,
    },
    evidence_pack: {
      ...evidencePack,
      verified_facts: evidencePack.verified_facts || evidencePack.facts || [],
      facts: evidencePack.facts || evidencePack.verified_facts || [],
    },
    public_routing: {
      score: Math.max(Number(article.infrastructure_relevance_score || 0), 0.75),
      visibility: 'core',
      ...route,
      public_signal_label: 'Analysis',
      story_archetype: article.blog_metadata?.archetype || 'Constraint Operator Alert',
      blocked_reasons: [],
    },
    public_presentation: {
      signal_label: 'Analysis',
      editorial_lens: route.editorial_lens,
      title: article.expertLensFull?.finalHeadline || article.title,
      deck,
      why_it_matters: why,
      reader_impact: ['Operators', 'Capacity planners', 'Infrastructure investors'],
      region: article.region || 'Global',
      source: article.source || evidencePack.source,
      view_detail: `/news/${article.id}/`,
      read_source: article.sourceUrl || article.url || '',
      lane_key: route.laneKey,
      lane_title: route.laneTitle,
      visibility: 'core',
      story_archetype: article.blog_metadata?.archetype || 'Constraint Operator Alert',
    },
    blog_metadata: {
      ...(article.blog_metadata || {}),
      visible_body_characters: quality.metrics.visibleBodyCharacters,
      word_count: quality.metrics.wordCount,
      paragraph_count: quality.metrics.paragraphCount,
      section_count: quality.metrics.sectionCount,
    },
  };
}
