import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
  SEARCH_INDEX_PATH,
} from './lib/constants.mjs';
import { syncArchiveArtifacts } from './lib/archive-store.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { buildEditorialStoryV2, canGenerateFullArticle } from './lib/editorial-story-engine-v2.mjs';
import { generateEditorialExcerpt } from './lib/editorial-excerpt-generator.mjs';
import { classifyInfrastructureRelevance } from './lib/relevance-classifier.mjs';
import { routePublicLane } from './lib/public-lane-router.mjs';
import { buildPublicPresentation } from './lib/public-presentation.mjs';
import { normalizeProperNouns } from './lib/proper-noun-normalizer.mjs';
import { guardPublicCopy } from './lib/copy-quality-guard.mjs';
import { guardPublicTemplatePhrases } from './lib/public-template-phrase-guard.mjs';
import { detectBoilerplate, cleanBoilerplateText } from './lib/boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './lib/truncation-detector.mjs';
import { sourceExtractionPassesLongformGate, sourceExtractionPassesPublicGate } from './lib/source-extraction-fail-closed.mjs';
import { articleDetailQualityResult } from './lib/article-detail-quality-gate.mjs';
import { homepageQualityResult } from './lib/homepage-quality-filter.mjs';
import { quarantineArticle, archiveOnlyNoindexArticle } from './lib/content-quarantine.mjs';
import { emergencyQualityModeState } from './lib/emergency-quality-mode.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/emergency-cleanup-report.md');
const DOC_PATH = path.join(ROOT, 'docs/emergency-content-quality-cleanup.md');
const GENERATION_VERSION = 'emergency_content_quality_cleanup_v1';
const SCAN_ARCHIVE_LIMIT = Number(process.env.EMERGENCY_CLEANUP_ARCHIVE_LIMIT || 100000);

const EXAMPLE_MATCHES = [
  ['Data Center Knowledge boilerplate item', (article) => sourceMatches(article, /Data Center Knowledge/i) && reasonMatches(article, /boilerplate|copyright|TechTarget/i)],
  ['NetApp OpenShift item', (article) => textMatches(article, /NetApp/i) && textMatches(article, /OpenShift/i)],
  ['AMD GPU deal item', (article) => titleMatches(article, /Radeon RX 9070|PowerColor Hellhound|all-time low pricing/i)],
  ['Dell XPS laptop review', (article) => titleMatches(article, /Dell XPS|XPS.*laptop|laptop review/i)],
  ['commencement speech AI item', (article) => titleMatches(article, /commencement|graduates|Your Career Starts/i)],
  ['LinkedIn recruitment spam item', (article) => textMatches(article, /LinkedIn recruitment|recruitment spam|prompt injection/i)],
  ['China data center spot power trading', (article) => titleMatches(article, /China Data Centers Tap Spot Power Trading|spot power trading/i)],
  ['Texas county data center moratorium', (article) => titleMatches(article, /Texas/i) && titleMatches(article, /moratorium|county/i)],
  ['KKR/Kokusai semiconductor equipment item', (article) => titleMatches(article, /KKR|Kokusai/i)],
  ['Data Center Frontier nuclear/data center item', (article) => sourceMatches(article, /Data Center Frontier/i) && titleMatches(article, /nuclear|reactor|microreactor/i)],
];

function byDateDesc(a, b) {
  return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
}

function mergeById(items = []) {
  const byId = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
  }
  return [...byId.values()].sort(byDateDesc);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function domainFor(article = {}) {
  const url = article.sourceUrl || article.url || '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return article.source || 'unknown';
  }
}

function publicText(article = {}) {
  return [
    article.title,
    article.summary,
    article.snippet,
    article.deck,
    article.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    article.expertLensShort,
    article.expertLens,
    article.expertLensFull?.thesis,
    article.expertLensFull?.metaDescription,
    article.expertLensFull?.finalArticleBody,
    article.articleText,
  ].filter(Boolean).join('\n\n');
}

function recordText(article = {}) {
  return [
    article.title,
    article.source,
    article.url,
    article.sourceUrl,
    article.summary,
    article.snippet,
    article.articleText,
    publicText(article),
  ].filter(Boolean).join('\n');
}

function titleMatches(article = {}, pattern) {
  return pattern.test(String(article.title || ''));
}

function sourceMatches(article = {}, pattern) {
  return pattern.test(String(article.source || article.sourceName || ''));
}

function textMatches(article = {}, pattern) {
  return pattern.test(recordText(article));
}

function reasonMatches(article = {}, pattern) {
  return unique([...(article.quarantine_reason || []), ...(article.seo_noindex_reasons || []), ...(article.public_routing?.blocked_reasons || [])])
    .some((reason) => pattern.test(reason));
}

function normalizePublicCopyFields(article = {}) {
  const next = { ...article };
  for (const key of ['title', 'summary', 'snippet', 'deck', 'why_it_matters', 'expertLensShort', 'expertLens']) {
    if (typeof next[key] === 'string') next[key] = normalizeProperNouns(cleanBoilerplateText(next[key]));
  }
  if (next.expertLensFull) {
    next.expertLensFull = { ...next.expertLensFull };
    for (const key of ['thesis', 'metaDescription', 'finalArticleBody', 'watchNext', 'whyThisMatters']) {
      if (typeof next.expertLensFull[key] === 'string') {
        next.expertLensFull[key] = normalizeProperNouns(cleanBoilerplateText(next.expertLensFull[key]));
      }
    }
  }
  return next;
}

function oldDeck(article = {}) {
  return normalizeProperNouns(
    article.public_presentation?.deck
    || article.deck
    || article.expertLensShort
    || article.summary
    || article.snippet
    || ''
  );
}

function oldLane(article = {}) {
  return article.public_routing?.laneTitle
    || article.public_routing?.lane_title
    || article.primary_category
    || article.category
    || 'Unknown';
}

function addAudit(article = {}, before = {}, classification = '') {
  return {
    ...article,
    emergency_cleanup_audit: {
      old_public_deck: oldDeck(before),
      old_lane: oldLane(before),
      old_homepagePublished: before.homepagePublished,
      old_articlePagePublished: before.articlePagePublished,
      old_noindex: before.noindex || before.seo_noindex || false,
      classification,
      cleaned_at: new Date().toISOString(),
    },
  };
}

function forceShortSignal(article = {}, route, reasons = []) {
  return {
    ...article,
    public_status: route.visibility === 'adjacent' ? 'adjacent_watchlist' : 'short_signal',
    homepagePublished: true,
    articlePagePublished: false,
    archiveOnly: false,
    signalCardOnly: true,
    noindex: route.visibility === 'adjacent' ? article.noindex === true : true,
    seo_noindex: route.visibility === 'adjacent' ? article.seo_noindex === true : true,
    seo_noindex_reasons: route.visibility === 'adjacent'
      ? article.seo_noindex_reasons || []
      : unique([...(article.seo_noindex_reasons || []), 'short_signal_no_local_article', ...reasons]),
    signalCardReason: unique(reasons).join('; ') || 'short_signal_only',
    public_routing: route,
    routing_decision: route.routing_decision,
  };
}

function markFullArticle(article = {}, story = {}, route) {
  return {
    ...article,
    public_status: 'published',
    generation_version: GENERATION_VERSION,
    public_generation_version: GENERATION_VERSION,
    public_copy_stale: false,
    homepagePublished: true,
    articlePagePublished: true,
    archiveOnly: false,
    signalCardOnly: false,
    noindex: false,
    seo_noindex: false,
    seo_noindex_reasons: [],
    public_routing: route,
    routing_decision: route.routing_decision,
    narrative_dna: story.narrative_dna,
    dynamic_brief_label: story.dynamicBriefLabel,
    expertLensShort: story.thesis,
    expertLens: story.thesis,
    expertLensFull: {
      ...(article.expertLensFull || {}),
      version: GENERATION_VERSION,
      mode: 'editorial-story-engine-v2',
      generatedAt: new Date().toISOString(),
      generation_version: GENERATION_VERSION,
      narrative_dna: story.narrative_dna,
      dynamicBriefLabel: story.dynamicBriefLabel,
      thesis: story.thesis,
      whatHappened: story.whatHappened,
      whyThisMatters: story.whyThisMatters,
      marketMissing: story.marketMissing,
      investors: story.investors,
      operators: story.operators,
      hyperscalers: story.hyperscalers,
      watchNext: story.watchNext,
      executiveSummary: story.executiveSummary,
      finalHeadline: article.title,
      metaDescription: story.metaDescription,
      finalArticleBody: normalizeProperNouns(story.finalArticleBody),
      sourceLink: article.sourceUrl || article.url || '',
    },
  };
}

function qualityFailures(article = {}) {
  const text = publicText(article);
  const template = guardPublicTemplatePhrases(text);
  const publicCopy = guardPublicCopy(text);
  const boilerplate = detectBoilerplate(text);
  const truncation = detectTruncationArtifacts(text, { allowEllipsis: true });
  const reasons = [];
  if (!template.ok) reasons.push(...template.reasons);
  if (!publicCopy.ok) reasons.push(...publicCopy.reasons);
  if (boilerplate.boilerplate_ratio > 0 || boilerplate.copyright_footer_detected || boilerplate.nav_or_cta_detected) {
    reasons.push('public_boilerplate_leakage');
  }
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  return {
    ok: reasons.length === 0,
    reasons: unique(reasons),
    template,
    publicCopy,
    boilerplate,
    truncation,
  };
}

function hasOnlyShortCleanEvidence(sourcePublic = {}) {
  const reasons = sourcePublic.block_reasons || sourcePublic.reasons || [];
  if (sourcePublic.ok) return false;
  if (!sourcePublic.boilerplate || sourcePublic.boilerplate.copyright_footer_detected) return false;
  if ((sourcePublic.boilerplate.boilerplate_ratio || 0) > 0.08) return false;
  if (!sourcePublic.truncation?.ok) return false;
  return reasons.length > 0 && reasons.every((reason) =>
    /cleaned_source_text_below_|source_evidence_length_below_|source_completeness|sentence_completion_score_below/i.test(String(reason))
  );
}

function statusFor(next = {}) {
  if (next.public_status === 'quarantined') return 'quarantine';
  if (next.public_status === 'archive_only_noindex') return 'archive_only_noindex';
  if (next.public_status === 'adjacent_watchlist') return 'adjacent_watchlist';
  if (next.public_status === 'short_signal') return 'keep_as_short_signal';
  if (next.articlePagePublished !== false && next.public_routing?.visibility === 'core') return 'keep_and_regenerate';
  return 'archive_only_noindex';
}

async function classifyAndCleanRecord(article = {}, context = {}) {
  const before = { ...article };
  let next = normalizePublicCopyFields(article);
  const relevance = classifyInfrastructureRelevance(next);
  next = { ...next, ...relevance, infrastructure_relevance: relevance };
  let route = routePublicLane(next);
  const sourcePublic = sourceExtractionPassesPublicGate(next);
  const sourceLongform = sourceExtractionPassesLongformGate(next);
  const quality = qualityFailures(next);
  const sourceHardDirty = sourcePublic.boilerplate.copyright_footer_detected
    || sourcePublic.boilerplate.boilerplate_ratio > 0.08
    || !sourcePublic.truncation.ok;
  const shortCleanEvidence = hasOnlyShortCleanEvidence(sourcePublic);
  const reasons = unique([
    ...(route.blocked_reasons || []),
    ...(sourcePublic.ok ? [] : sourcePublic.block_reasons.map((reason) => `source_extraction:${reason}`)),
    ...(quality.ok ? [] : quality.reasons),
  ]);

  if (route.visibility === 'archive' && !sourceHardDirty && quality.truncation.ok) {
    next = archiveOnlyNoindexArticle(next, reasons.length ? reasons : ['archive_route']);
    return addAudit(next, before, statusFor(next));
  }

  if (sourceHardDirty) {
    next = quarantineArticle(next, reasons.length ? reasons : ['public_quality_failed'], { force: true });
    return addAudit(next, before, statusFor(next));
  }

  if (route.visibility === 'adjacent') {
    next = forceShortSignal(next, route, route.blocked_reasons || ['adjacent_watchlist']);
  } else if (route.visibility === 'core' && sourceLongform.ok && canGenerateFullArticle(next).ok) {
    const story = buildEditorialStoryV2(next, { recentHooks: context.recentDecks || [] });
    if (story.ok) {
      next = markFullArticle(next, story, route);
      const detailGate = articleDetailQualityResult(next, { route });
      if (!detailGate.ok) {
        next = forceShortSignal(next, route, detailGate.reasons);
      }
    } else {
      next = forceShortSignal(next, route, story.blocked_reasons || ['story_generation_blocked']);
    }
  } else if (route.visibility === 'core' && (sourcePublic.ok || shortCleanEvidence)) {
    next = forceShortSignal(next, route, sourceLongform.block_reasons || ['longform_gate_failed']);
  } else {
    next = quarantineArticle(next, reasons.length ? reasons : ['public_quality_failed'], { force: true });
    return addAudit(next, before, statusFor(next));
  }

  route = next.public_routing || routePublicLane(next);
  const excerpt = generateEditorialExcerpt(next, { route, recentDecks: context.recentDecks || [] });
  next = {
    ...next,
    public_generation_version: GENERATION_VERSION,
    deck: excerpt.deck,
    summary: excerpt.why_it_matters,
    snippet: excerpt.deck,
    expertLensShort: next.articlePagePublished === false ? excerpt.deck : next.expertLensShort,
    expertLens: next.articlePagePublished === false ? excerpt.deck : next.expertLens,
    why_it_matters: excerpt.why_it_matters,
    public_presentation: buildPublicPresentation(
      { ...next, deck: excerpt.deck, why_it_matters: excerpt.why_it_matters },
      { route, recentDecks: context.recentDecks || [] }
    ),
  };

  if (next.homepagePublished !== false) {
    const homepageGate = homepageQualityResult(next, {
      route,
      presentation: next.public_presentation,
      recentDecks: context.recentDecks || [],
    });
    if (!homepageGate.ok) {
      next = next.articlePagePublished !== false
        ? { ...next, homepagePublished: false, homepageSuppressedReason: homepageGate.reasons.join('; ') }
        : quarantineArticle(next, homepageGate.reasons, { force: true });
    }
  }

  if (next.public_presentation?.deck) context.recentDecks?.push(next.public_presentation.deck);
  return addAudit(next, before, statusFor(next));
}

function tally(records = []) {
  const counts = {
    total_scanned: records.length,
    kept_full_articles: 0,
    kept_short_signals: 0,
    adjacent_watchlist: 0,
    quarantined: 0,
    archive_only_noindex: 0,
    source_extraction_failures: 0,
    relevance_failures: 0,
    template_phrase_failures: 0,
    truncation_failures: 0,
    boilerplate_failures: 0,
  };
  const domainFailures = new Map();
  for (const record of records) {
    const audit = record.emergency_cleanup_audit || {};
    if (audit.classification === 'keep_and_regenerate') counts.kept_full_articles += 1;
    if (audit.classification === 'keep_as_short_signal') counts.kept_short_signals += 1;
    if (audit.classification === 'adjacent_watchlist') counts.adjacent_watchlist += 1;
    if (audit.classification === 'quarantine') counts.quarantined += 1;
    if (audit.classification === 'archive_only_noindex') counts.archive_only_noindex += 1;
    const reasons = unique([
      ...(record.quarantine_reason || []),
      ...(record.seo_noindex_reasons || []),
      ...(record.public_routing?.blocked_reasons || []),
      record.archiveOnlyReason,
      record.signalCardReason,
    ]);
    if (reasons.some((reason) => /source_extraction|cleaned_source|source_evidence|copyright|boilerplate|sentence_completion|truncated/i.test(reason))) {
      counts.source_extraction_failures += 1;
      domainFailures.set(domainFor(record), (domainFailures.get(domainFor(record)) || 0) + 1);
    }
    if (reasons.some((reason) => /relevance|product_boundary|missing_concrete/i.test(reason))) counts.relevance_failures += 1;
    if (reasons.some((reason) => /template_phrase|forbidden_phrase/i.test(reason))) counts.template_phrase_failures += 1;
    if (reasons.some((reason) => /fragment|truncated|sentence_completion|clo|fuelin|hundreds/i.test(reason))) counts.truncation_failures += 1;
    if (reasons.some((reason) => /boilerplate|copyright|newsletter|registered office/i.test(reason))) counts.boilerplate_failures += 1;
  }
  return {
    counts,
    topDomains: [...domainFailures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

function exampleRows(records = []) {
  return EXAMPLE_MATCHES.map(([label, matches]) => {
    const article = records.find((item) => matches(item));
    if (!article) {
      return [`### ${label}`, '', '- No matching record found.', ''].join('\n');
    }
    const audit = article.emergency_cleanup_audit || {};
    const visible = article.homepagePublished !== false || article.articlePagePublished !== false;
    const newPresentation = visible
      ? (article.public_presentation?.deck || article.deck || 'n/a')
      : `Not public: ${article.public_status || audit.classification || 'hidden'}; noindex=${article.noindex === true || article.seo_noindex === true}`;
    return [
      `### ${label}`,
      '',
      `- Title: ${article.title}`,
      `- URL: ${article.articlePagePublished === false ? (article.sourceUrl || article.url || 'n/a') : `/news/${article.id}/`}`,
      `- Old public deck: ${audit.old_public_deck || 'n/a'}`,
      `- New public presentation: ${newPresentation}`,
      `- Old lane: ${audit.old_lane || 'n/a'}`,
      `- New lane: ${article.public_routing?.laneTitle || article.public_routing?.lane_key || 'n/a'}`,
      `- Classification: ${audit.classification || article.public_status || 'n/a'}`,
      `- Reasons: ${unique([...(article.quarantine_reason || []), article.archiveOnlyReason, article.signalCardReason, ...(article.public_routing?.blocked_reasons || [])]).join('; ') || 'none'}`,
      '',
    ].join('\n');
  });
}

async function writeReports(records = [], latest = [], archive = []) {
  const { counts, topDomains } = tally(records);
  const urlsChanged = records
    .filter((item) => item.emergency_cleanup_audit)
    .map((item) => item.articlePagePublished === false ? item.sourceUrl || item.url || `/news/${item.id}/` : `/news/${item.id}/`)
    .filter(Boolean);
  const report = [
    '# Emergency Cleanup Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Emergency mode: ${emergencyQualityModeState().enabled ? 'enabled' : 'disabled'}`,
    '',
    '## Summary',
    '',
    `- Total scanned: ${counts.total_scanned}`,
    `- Kept full articles: ${counts.kept_full_articles}`,
    `- Kept short signals: ${counts.kept_short_signals}`,
    `- Adjacent watchlist: ${counts.adjacent_watchlist}`,
    `- Quarantined: ${counts.quarantined}`,
    `- Archive-only/noindex: ${counts.archive_only_noindex}`,
    `- Source extraction failures: ${counts.source_extraction_failures}`,
    `- Relevance failures: ${counts.relevance_failures}`,
    `- Template phrase failures: ${counts.template_phrase_failures}`,
    `- Truncation failures: ${counts.truncation_failures}`,
    `- Boilerplate failures: ${counts.boilerplate_failures}`,
    '',
    '## Top Extraction Failure Domains',
    '',
    ...(topDomains.length ? topDomains.map(([domain, count]) => `- ${domain}: ${count}`) : ['- None']),
    '',
    '## Before / After Examples',
    '',
    ...exampleRows(records),
    '## Public URLs Changed',
    '',
    ...urlsChanged.slice(0, 120).map((url) => `- ${url}`),
    urlsChanged.length > 120 ? `- ...and ${urlsChanged.length - 120} more` : '',
    '',
    '## Cache Purge',
    '',
    '- Pending: run `npm run purge:public-cache` after cleanup/regeneration.',
    '',
    '## Artifacts',
    '',
    `- Latest records after sync: ${latest.length}`,
    `- Archive records after sync: ${archive.length}`,
  ].filter((line) => line !== '').join('\n');
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${report}\n`, 'utf8');

  const doc = [
    '# Emergency Content Quality Cleanup',
    '',
    'Emergency quality mode is enabled by default. Crawling and internal records can continue, but public publishing is fail-closed unless the item passes extraction, relevance, copy, homepage, detail, SEO, sitemap, and RSS quality gates.',
    '',
    'Disable only with:',
    '',
    '```sh',
    'COMPUTE_CURRENT_DISABLE_EMERGENCY_QUALITY_MODE=true',
    '```',
    '',
    'Quarantined records are marked `public_status = "quarantined"`, hidden from homepage/detail pages, excluded from sitemap/RSS/search, and noindexed.',
  ].join('\n');
  await fs.writeFile(DOC_PATH, `${doc}\n`, 'utf8');
}

export async function runEmergencyCleanup() {
  const latest = await readJsonFile(LATEST_NEWS_PATH, []);
  const archive = await readJsonFile(ARCHIVE_NEWS_PATH, []);
  const searchIndex = await readJsonFile(SEARCH_INDEX_PATH, []);
  const publicIds = new Set([...latest, ...searchIndex].filter((item) => item?.homepagePublished !== false || item?.articlePagePublished !== false).map((item) => item.id));
  const archiveWindow = archive.sort(byDateDesc).slice(0, SCAN_ARCHIVE_LIMIT);
  const candidates = mergeById([
    ...latest,
    ...archive.filter((item) => publicIds.has(item.id)),
    ...archiveWindow,
  ]);
  const untouchedArchive = archive.filter((item) => !candidates.some((candidate) => candidate.id === item.id));
  const context = { recentDecks: [] };
  const cleaned = [];
  for (const article of candidates) {
    cleaned.push(await classifyAndCleanRecord(article, context));
  }
  const { latest: nextLatest, archive: nextArchive } = await syncArchiveArtifacts([...cleaned, ...untouchedArchive], []);
  await writeJsonFile(LATEST_NEWS_PATH, nextLatest);
  await writeJsonFile(ARCHIVE_NEWS_PATH, nextArchive);
  await writeReports(cleaned, nextLatest, nextArchive);
  console.log(`emergency cleanup scanned ${cleaned.length}; latest=${nextLatest.length}; archive=${nextArchive.length}`);
  return { cleaned, latest: nextLatest, archive: nextArchive };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  await runEmergencyCleanup();
}
