import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncArchiveArtifacts } from './lib/archive-store.mjs';
import { BANNED_PHRASES, bannedPhraseMatches, hasBannedPhrase } from './lib/banned-phrases.mjs';
import {
  LATEST_NEWS_PATH,
  ARCHIVE_NEWS_PATH,
} from './lib/constants.mjs';
import { hydrateExpertLens } from './lib/expert-lens.mjs';
import { applyAntiTemplateRewrite } from './lib/anti-template-rewrite.mjs';
import { classifyInfrastructureRelevance } from './lib/relevance-classifier.mjs';
import { qualityGateReason } from './lib/quality-gate.mjs';
import { buildNarrativeLensFields, extractNarrativeDNA, GENERATION_VERSION } from './lib/narrative-dna.mjs';
import { analyzeArticleRepetition } from './lib/repetition-detector.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { truncate } from './lib/normalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/regeneration-report.md');
const TARGET_PUBLIC_COUNT = Number(process.env.NARRATIVE_DNA_REGENERATE_COUNT || 100);

function articleBody(article = {}) {
  return article.expertLensFull?.finalArticleBody || article.finalArticleBody || article.articleText || article.summary || '';
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripBannedPhrases(value) {
  if (typeof value === 'string') {
    let next = value;
    for (const phrase of BANNED_PHRASES) {
      next = next.replace(new RegExp(escapeRegExp(phrase).replace(/\s+/g, '\\s+'), 'gi'), '');
    }
    return next.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  if (Array.isArray(value)) return value.map(stripBannedPhrases);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, stripBannedPhrases(entry)])
    );
  }
  return value;
}

function scrubStoredBannedPhrases(article = {}) {
  if (!hasBannedPhrase(JSON.stringify(article))) return article;

  const cleaned = stripBannedPhrases({
    ...article,
    expertLensFull: null,
    finalArticleBody: undefined,
    searchText: undefined,
  });
  const signalText = truncate(cleaned.summary || cleaned.snippet || cleaned.title || '', 220);
  const narrativeSource = {
    ...cleaned,
    expertLensFull: null,
    expertLensShort: null,
    expertLens: null,
    finalArticleBody: null,
    searchText: null,
  };

  return {
    ...cleaned,
    expertLensFull: null,
    expertLensShort: signalText,
    expertLens: signalText,
    articlePagePublished: false,
    homepagePublished: false,
    archiveOnly: true,
    seo_noindex: true,
    noindex: true,
    noindex_reason: 'banned_phrase_store_scrub',
    archiveOnlyReason: 'banned_phrase_store_scrub',
    banned_phrase_scrubbed: true,
    generation_version: GENERATION_VERSION,
    narrative_dna: extractNarrativeDNA(narrativeSource),
    searchText: undefined,
  };
}

function sortNewest(records = []) {
  return [...records].sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
}

function mergeById(records = []) {
  const map = new Map();
  for (const record of records) {
    if (!record?.id) continue;
    map.set(record.id, { ...(map.get(record.id) || {}), ...record });
  }
  return [...map.values()];
}

function pageIsPublic(article = {}) {
  return article.articlePagePublished !== false && article.archiveOnly !== true;
}

function extractionBlocked(article = {}) {
  const reason = qualityGateReason(article);
  return reason ? reason : null;
}

function relevanceBlocked(article = {}) {
  const relevance = article.infrastructure_relevance || classifyInfrastructureRelevance(article);
  if (relevance.infrastructure_relevance_score >= 0.75) return null;
  return `infrastructure_relevance_score ${relevance.infrastructure_relevance_score.toFixed(2)} routes to ${relevance.infrastructure_relevance_action}`;
}

function withRoutingFields(article = {}) {
  const relevance = article.infrastructure_relevance || classifyInfrastructureRelevance(article);
  const lowRelevanceReason = relevanceBlocked({ ...article, infrastructure_relevance: relevance });
  if (!lowRelevanceReason) {
    return {
      ...article,
      infrastructure_relevance: relevance,
      infrastructure_relevance_score: relevance.infrastructure_relevance_score,
      infrastructure_relevance_tier: relevance.infrastructure_relevance_tier,
      infrastructure_relevance_action: relevance.infrastructure_relevance_action,
      articlePagePublished: true,
      homepagePublished: true,
      archiveOnly: false,
      seo_noindex: false,
      noindex: false,
      archiveOnlyReason: null,
      signalCardReason: null,
      qualityGateReason: null,
      repetition_blocked: false,
      repetition_block_reasons: [],
      searchText: undefined,
    };
  }

  const signal = relevance.infrastructure_relevance_score >= 0.45;
  const signalText = truncate(article.summary || article.snippet || article.title || '', 220);
  return {
    ...article,
    infrastructure_relevance: relevance,
    infrastructure_relevance_score: relevance.infrastructure_relevance_score,
    infrastructure_relevance_tier: relevance.infrastructure_relevance_tier,
    infrastructure_relevance_action: relevance.infrastructure_relevance_action,
    articlePagePublished: false,
    homepagePublished: signal,
    archiveOnly: !signal,
    seo_noindex: true,
    noindex: true,
    noindex_reason: lowRelevanceReason,
    archiveOnlyReason: signal ? null : lowRelevanceReason,
    signalCardReason: signal ? lowRelevanceReason : null,
    expertLensFull: null,
    expertLensShort: signalText,
    expertLens: signalText,
    generation_version: GENERATION_VERSION,
    narrative_dna: article.narrative_dna || extractNarrativeDNA(article),
    searchText: undefined,
  };
}

function narrativeArticle(article = {}, recentRecords = []) {
  const recentHooks = recentRecords
    .map((record) => articleBody(record).split(/\n{2,}/).find(Boolean))
    .filter(Boolean);
  const narrative = buildNarrativeLensFields(article, { recentHooks });
  const full = {
    ...(article.expertLensFull || {}),
    ...narrative,
    version: article.expertLensFull?.version,
    generatedAt: new Date().toISOString(),
    generation_version: GENERATION_VERSION,
    narrative_dna: narrative.narrative_dna || extractNarrativeDNA(article),
    dynamicBriefLabel: narrative.dynamicBriefLabel,
  };
  const next = {
    ...article,
    generation_version: GENERATION_VERSION,
    narrative_dna: full.narrative_dna,
    dynamic_brief_label: full.dynamicBriefLabel,
    expertLensFull: full,
    expertLensShort: full.thesis,
    expertLens: full.thesis,
    articleText: article.articleText,
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    seo_noindex: false,
    noindex: false,
    archiveOnlyReason: null,
    signalCardReason: null,
    qualityGateReason: null,
    repetition_blocked: false,
    repetition_block_reasons: [],
    searchText: undefined,
  };

  if (hasBannedPhrase(JSON.stringify(full))) {
    const matches = bannedPhraseMatches(JSON.stringify(full));
    return {
      ...next,
      articlePagePublished: false,
      homepagePublished: false,
      archiveOnly: true,
      seo_noindex: true,
      noindex: true,
      archiveOnlyReason: `banned_phrase_guard:${Object.keys(matches).join('|')}`,
      banned_phrase_guard_blocked: true,
      banned_phrase_matches: matches,
    };
  }

  return next;
}

function blockArticle(article = {}, reason = '') {
  return {
    ...article,
    articlePagePublished: false,
    homepagePublished: false,
    archiveOnly: true,
    seo_noindex: true,
    noindex: true,
    qualityGateBlocked: reason.includes('extraction') || reason.includes('boilerplate') || reason.includes('copyright'),
    qualityGateReason: reason,
    archiveOnlyReason: reason,
    generation_version: GENERATION_VERSION,
    narrative_dna: article.narrative_dna || extractNarrativeDNA(article),
    searchText: undefined,
  };
}

function reportLineArticle(article = {}, status = '', reason = '') {
  return `- ${status}: ${article.title || article.id} (${article.id})${reason ? ` - ${reason}` : ''}`;
}

async function main() {
  const latest = await readJsonFile(LATEST_NEWS_PATH, []);
  const archive = await readJsonFile(ARCHIVE_NEWS_PATH, []);
  const merged = sortNewest(mergeById([...archive, ...latest]).map((article) => hydrateExpertLens(article)));
  const publicTargets = merged
    .filter((article) => article.homepagePublished !== false || pageIsPublic(article) || article.generation_version === GENERATION_VERSION || article.qualityGateBlocked || article.repetition_blocked)
    .slice(0, Math.max(TARGET_PUBLIC_COUNT, 220));
  const targetIds = new Set([
    ...latest.map((article) => article.id).filter(Boolean),
    ...publicTargets.map((article) => article.id),
  ]);
  const recentRolling = merged.filter((article) => !targetIds.has(article.id)).slice(0, 50);
  const report = {
    regenerated: [],
    blockedExtraction: [],
    downgradedRelevance: [],
    blockedRepetition: [],
    bannedAfter: [],
  };

  const transformed = [];
  for (const article of merged) {
    if (!targetIds.has(article.id)) {
      transformed.push(article);
      continue;
    }

    const extractionReason = extractionBlocked(article);
    if (extractionReason) {
      const blocked = blockArticle(article, `source_extraction_fail_closed:${extractionReason}`);
      transformed.push(blocked);
      report.blockedExtraction.push([article, blocked.archiveOnlyReason]);
      recentRolling.unshift(blocked);
      continue;
    }

    const routed = withRoutingFields(article);
    if (routed.articlePagePublished === false) {
      transformed.push(routed);
      report.downgradedRelevance.push([article, routed.signalCardReason || routed.archiveOnlyReason]);
      recentRolling.unshift(routed);
      continue;
    }

    let regenerated = narrativeArticle(routed, recentRolling);
    [regenerated] = applyAntiTemplateRewrite([regenerated], recentRolling);
    const repetition = analyzeArticleRepetition(regenerated, recentRolling);
    regenerated = {
      ...regenerated,
      repetition_check: repetition,
      repetition_blocked: repetition.blocked,
      repetition_block_reasons: repetition.reasons,
    };

    if (repetition.blocked) {
      regenerated = blockArticle(regenerated, `repetition_gate:${repetition.reasons.join('; ')}`);
      report.blockedRepetition.push([article, regenerated.archiveOnlyReason]);
    } else if (hasBannedPhrase(JSON.stringify(regenerated.expertLensFull || {}))) {
      const matches = bannedPhraseMatches(JSON.stringify(regenerated.expertLensFull || {}));
      regenerated = blockArticle(regenerated, `banned_phrase_guard:${Object.keys(matches).join('|')}`);
      report.bannedAfter.push([article, regenerated.archiveOnlyReason]);
    } else {
      report.regenerated.push(regenerated);
    }

    transformed.push(regenerated);
    recentRolling.unshift(regenerated);
  }

  const scrubbed = transformed.map(scrubStoredBannedPhrases);
  const scrubbedCount = scrubbed.filter((article) => article.banned_phrase_scrubbed).length;
  const { latest: nextLatest, archive: nextArchive, supabaseStatus } = await syncArchiveArtifacts(scrubbed, []);
  await writeJsonFile(LATEST_NEWS_PATH, nextLatest);
  await writeJsonFile(ARCHIVE_NEWS_PATH, nextArchive);

  const reportText = [
    '# NarrativeDNA Regeneration Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Generation version: \`${GENERATION_VERSION}\``,
    `Target public articles examined: ${publicTargets.length}`,
    `Regenerated full articles: ${report.regenerated.length}`,
    `Extraction fail-closed blocks: ${report.blockedExtraction.length}`,
    `Relevance downgrades to signal/archive: ${report.downgradedRelevance.length}`,
    `Repetition blocks: ${report.blockedRepetition.length}`,
    `Banned phrase blocks after rewrite: ${report.bannedAfter.length}`,
    `Stored legacy banned-phrase scrubs: ${scrubbedCount}`,
    `Archive push: ${JSON.stringify(supabaseStatus)}`,
    '',
    '## Regenerated Articles',
    ...report.regenerated.slice(0, 40).map((article) =>
      reportLineArticle(article, 'regenerated', `${article.narrative_dna?.story_archetype || 'NarrativeDNA'} / ${article.dynamic_brief_label || 'dynamic brief'}`)
    ),
    report.regenerated.length > 40 ? `- ...${report.regenerated.length - 40} additional regenerated articles` : '',
    '',
    '## Extraction Blocks',
    ...report.blockedExtraction.map(([article, reason]) => reportLineArticle(article, 'blocked', reason)),
    '',
    '## Relevance Downgrades',
    ...report.downgradedRelevance.map(([article, reason]) => reportLineArticle(article, 'downgraded', reason)),
    '',
    '## Banned Phrase Inventory',
    ...BANNED_PHRASES.map((phrase) => `- ${phrase}`),
    '',
    '## Notes',
    '- Full memo regeneration now writes NarrativeDNA fields, dynamic brief labels, and generation_version on each regenerated article.',
    '- Low-relevance and extraction-failed records are conservative noindex/archive or signal-card records; they do not receive long-form generated bodies.',
    '- CDN/ISR cache purge is handled by `npm run purge:deployment-cache` when deployment credentials are available.',
  ].filter((line) => line !== '').join('\n');

  await fs.writeFile(REPORT_PATH, `${reportText}\n`, 'utf8');
  console.log(`regenerated=${report.regenerated.length} blockedExtraction=${report.blockedExtraction.length} downgraded=${report.downgradedRelevance.length}`);
  console.log(`report=${path.relative(ROOT, REPORT_PATH)}`);
}

await main();
