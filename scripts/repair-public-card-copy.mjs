import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cardCopyQualityResult,
  generateCardCopy,
  isSourceAttributionScaffolding,
  sourceCardExcerpt,
} from './lib/card-copy-quality-gate.mjs';
import { guardPublicTemplatePhrases } from './lib/public-template-phrase-guard.mjs';
import { routePublicLane } from './lib/public-lane-router.mjs';
import { writeJsonFile } from './lib/state-store.mjs';
import { rebuildTaxonomyPages } from './rebuild-taxonomy-pages.mjs';
import { safeSourceUrlFor } from '../src/lib/seo-safeguards.js';
import { publicSurfaceDecision } from './lib/public-surface-eligibility.mjs';
import { syncArticleImagesById } from './lib/article-image-surface.mjs';
import { SOURCE_EVIDENCE_FIELDS, sanitizeArticleSourceEvidence } from './lib/source-evidence-integrity.mjs';
import { buildProjectedSearchText } from '../src/lib/public-search-projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PATHS = {
  latest: path.join(ROOT, 'src/data/latest-news.json'),
  archive: path.join(ROOT, 'src/data/archived-news.json'),
  search: path.join(ROOT, 'src/data/search-index.json'),
  taxonomy: path.join(ROOT, 'src/data/taxonomy-pages.json'),
  taxonomyReport: path.join(ROOT, 'docs/taxonomy-pages-report.md'),
  report: path.join(ROOT, 'docs/public-card-copy-repair-report.md'),
};
const PUBLIC_FEED_RESTORE_IDS = new Set([
  'be2060f4c0fc9986', // Storage capacity: AIC 32-bay JBOF.
  '4de03cdf5aad8af1', // Power: Gartner data-center electricity forecast.
  '95ded0cd1bc972ec', // Capital: TensorWave AI-cloud financing.
  'ab2422a259d8f4dc', // Policy and siting: local opposition to data centers.
]);
const SOURCE_COPY_FIELDS = ['deck', 'summary', 'snippet', 'excerpt', 'expertLensShort', 'expertLens'];
const EMPTY_COPY_FIELDS = ['why_it_matters'];
const MUTABLE_FIELDS = [
  ...SOURCE_EVIDENCE_FIELDS,
  ...SOURCE_COPY_FIELDS,
  ...EMPTY_COPY_FIELDS,
  'searchText',
  'public_presentation',
  'public_status',
  'public_content_tier',
  'homepagePublished',
  'articlePagePublished',
  'archiveOnly',
  'noindex',
  'seo_noindex',
  'signalCardOnly',
  'quarantined',
  'quarantine_reason',
  'seo_noindex_reasons',
  'archiveOnlyReason',
  'qualityGateBlocked',
  'qualityGateReason',
  'qualityGateBlockedAt',
  'routing_decision',
  'public_routing',
  'signalCardReason',
  'infrastructure_relevance_tier',
  'infrastructure_relevance_action',
  'infrastructureRelevanceAction',
  'infrastructure_relevance',
  'article_blueprint',
  'articleBlueprint',
];

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function containsLegacyFormula(value = '', article = {}) {
  return typeof value === 'string'
    && value.trim()
    && (!guardPublicTemplatePhrases(value).ok || isSourceAttributionScaffolding(value, article));
}

function recordContainsLegacyFormula(article = {}) {
  return [
    ...SOURCE_COPY_FIELDS.map((field) => article[field]),
    ...EMPTY_COPY_FIELDS.map((field) => article[field]),
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
  ].some((value) => containsLegacyFormula(value, article));
}

function searchTextFor(article = {}, excerpt = '') {
  if (!isPublicSourceSignal(article)) return buildProjectedSearchText(article);
  return buildProjectedSearchText(article, {
    deck: excerpt || article.public_presentation?.deck || article.deck,
    why_it_matters: '',
  });
}

function immutableProjection(article = {}) {
  const copy = structuredClone(article);
  for (const field of MUTABLE_FIELDS) delete copy[field];
  return copy;
}

export function immutableCorpusDigest(records = []) {
  return hash(records.map(immutableProjection));
}

function isPublicCandidate(article = {}) {
  return article.homepagePublished === true
    && article.archiveOnly !== true
    && article.public_content_tier !== 'hidden'
    && article.public_status !== 'archive_only_noindex';
}

function isPublicSourceSignal(article = {}) {
  return isPublicCandidate(article)
    && article.articlePagePublished !== true
    && article.public_content_tier !== 'longform_analysis';
}

function quarantinePublicRecord(article = {}, reason = 'missing_source_grounded_card_copy') {
  const quarantined = { ...article };
  for (const field of SOURCE_COPY_FIELDS) {
    if (reason !== 'missing_source_grounded_card_copy' || containsLegacyFormula(quarantined[field], article)) {
      quarantined[field] = '';
    }
  }
  for (const field of EMPTY_COPY_FIELDS) quarantined[field] = '';
  quarantined.public_presentation = {
    ...(article.public_presentation || {}),
    deck: '',
    why_it_matters: '',
  };
  quarantined.public_status = 'archive_only_noindex';
  quarantined.public_content_tier = 'hidden';
  quarantined.homepagePublished = false;
  quarantined.articlePagePublished = false;
  quarantined.archiveOnly = true;
  quarantined.noindex = true;
  quarantined.seo_noindex = true;
  quarantined.seo_noindex_reasons = [reason];
  quarantined.archiveOnlyReason = reason;
  quarantined.qualityGateBlocked = true;
  quarantined.qualityGateReason = reason;
  quarantined.routing_decision = 'archive_only_noindex';
  quarantined.public_routing = {
    ...routePublicLane(article),
    visibility: 'archive',
    laneKey: 'archive',
    laneTitle: 'Archive',
    routing_decision: 'archive_only_noindex',
    blocked_reasons: [reason],
  };
  quarantined.quarantined = true;
  quarantined.quarantine_reason = reason;
  quarantined.searchText = searchTextFor(quarantined);
  return quarantined;
}

export function repairPublicCardRecord(article = {}) {
  const original = article;
  const sourceRepair = isPublicCandidate(article)
    ? sanitizeArticleSourceEvidence(article)
    : { article, changed: false, contaminatedFields: [] };
  article = sourceRepair.article;
  const excerpt = sourceCardExcerpt(article);
  if (article.quarantined === true && !isPublicCandidate(article)) {
    const searchText = searchTextFor(article);
    if (article.searchText !== searchText) {
      return {
        article: { ...article, searchText },
        changed: true,
        reason: 'search_text_normalized',
        searchNormalized: true,
        sourceEvidenceRepaired: false,
      };
    }
    return { article, changed: false, reason: 'clean', searchNormalized: false, sourceEvidenceRepaired: false };
  }
  if (!excerpt && isPublicCandidate(article)) {
    const quarantined = quarantinePublicRecord(article);
    return {
      article: quarantined,
      changed: hash(original) !== hash(quarantined),
      reason: 'quarantined_missing_source_excerpt',
      searchNormalized: article.searchText !== quarantined.searchText,
      sourceEvidenceRepaired: sourceRepair.changed,
    };
  }

  if (
    excerpt
    && isPublicSourceSignal(article)
    && compact(article.public_presentation?.deck || article.deck) !== compact(excerpt)
  ) {
    const repaired = {
      ...article,
      deck: excerpt,
      summary: excerpt,
      public_presentation: {
        ...(article.public_presentation || {}),
        deck: excerpt,
        why_it_matters: '',
      },
    };
    repaired.searchText = searchTextFor(repaired, excerpt);
    return {
      article: repaired,
      changed: true,
      reason: 'source_excerpt_repair',
      excerpt,
      searchNormalized: article.searchText !== repaired.searchText,
      sourceEvidenceRepaired: sourceRepair.changed,
    };
  }

  if (!recordContainsLegacyFormula(article)) {
    const searchText = searchTextFor(article, excerpt);
    if (article.searchText !== searchText) {
      return {
        article: { ...article, searchText },
        changed: true,
        reason: 'search_text_normalized',
        searchNormalized: true,
        sourceEvidenceRepaired: sourceRepair.changed,
      };
    }
    return {
      article,
      changed: sourceRepair.changed,
      reason: sourceRepair.changed ? 'source_evidence_repair' : 'clean',
      searchNormalized: false,
      sourceEvidenceRepaired: sourceRepair.changed,
    };
  }

  if (!excerpt) {
    const quarantined = quarantinePublicRecord(article);
    return {
      article: quarantined,
      changed: true,
      reason: 'quarantined_missing_source_excerpt',
      searchNormalized: article.searchText !== quarantined.searchText,
      sourceEvidenceRepaired: sourceRepair.changed,
    };
  }

  const repaired = { ...article };
  for (const field of SOURCE_COPY_FIELDS) {
    if (containsLegacyFormula(repaired[field], article)) repaired[field] = excerpt;
  }
  for (const field of EMPTY_COPY_FIELDS) {
    if (containsLegacyFormula(repaired[field], article)) repaired[field] = '';
  }
  repaired.public_presentation = {
    ...(article.public_presentation || {}),
    deck: excerpt,
    why_it_matters: '',
  };
  repaired.searchText = searchTextFor(repaired, excerpt);

  return {
    article: repaired,
    changed: true,
    reason: 'source_excerpt_repair',
    excerpt,
    searchNormalized: article.searchText !== repaired.searchText,
    sourceEvidenceRepaired: sourceRepair.changed,
  };
}

export function repairPublicCardCorpus(records = []) {
  const results = records.map(repairPublicCardRecord).map((result, index) => {
    if (!isPublicSourceSignal(result.article)) return result;
    const copyQuality = cardCopyQualityResult(generateCardCopy(result.article), result.article);
    if (copyQuality.ok) return result;
    const article = quarantinePublicRecord(result.article, 'card_copy_quality_gate_failed');
    return {
      ...result,
      article,
      changed: hash(records[index]) !== hash(article),
      reason: 'quarantined_card_copy_quality',
      cardQualityReasons: copyQuality.reasons,
    };
  });
  return {
    records: results.map((result) => result.article),
    changed: results.filter((result) => result.changed),
    repaired: results.filter((result) => result.reason === 'source_excerpt_repair'),
    quarantined: results.filter((result) => result.reason === 'quarantined_missing_source_excerpt'),
    cardQuarantined: results.filter((result) => result.reason === 'quarantined_card_copy_quality'),
    sourceEvidenceRepaired: results.filter((result) => result.sourceEvidenceRepaired),
    searchNormalized: results.filter((result) => result.searchNormalized),
  };
}

function sourceSignalImage(article = {}) {
  return compact(
    article.public_presentation?.image
      || article.thumbnailImage
      || article.heroImage
      || article.generatedImage
      || article.sourceImage,
  );
}

function canRestoreSourceSignal(article = {}) {
  return Boolean(
    sourceCardExcerpt(article)
      && safeSourceUrlFor(article)
      && sourceSignalImage(article)
      && routePublicLane(article).visibility !== 'archive',
  );
}

export function restorePublicSourceSignals(records = [], restoreIds = PUBLIC_FEED_RESTORE_IDS) {
  const restored = [];
  const rejected = [];
  const repairedRecords = records.map((article) => {
    if (!restoreIds.has(article?.id) || !canRestoreSourceSignal(article)) return article;
    const excerpt = sourceCardExcerpt(article);
    const route = routePublicLane(article);
    const next = {
      ...article,
      public_status: 'signal',
      public_content_tier: 'signal_card',
      homepagePublished: true,
      articlePagePublished: false,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      seo_noindex_reasons: [],
      archiveOnlyReason: null,
      qualityGateBlocked: false,
      qualityGateReason: '',
      routing_decision: 'source_signal',
      public_routing: {
        ...route,
        routing_decision: 'source_signal',
        blocked_reasons: [],
      },
      signalCardReason: '',
      infrastructure_relevance_tier: 'signal_card',
      infrastructure_relevance_action: 'publish_signal_card_only',
      infrastructureRelevanceAction: 'publish_signal_card_only',
      infrastructure_relevance: {
        ...(article.infrastructure_relevance || {}),
        infrastructure_relevance_tier: 'signal_card',
        infrastructure_relevance_action: 'publish_signal_card_only',
        infrastructureRelevanceAction: 'publish_signal_card_only',
        articlePagePublished: false,
        homepagePublished: true,
        archiveOnly: false,
        archiveOnlyReason: null,
      },
      article_blueprint: null,
      articleBlueprint: null,
      signalCardOnly: true,
      quarantined: false,
      quarantine_reason: '',
      public_presentation: {
        ...(article.public_presentation || {}),
        deck: excerpt,
        why_it_matters: '',
        image: sourceSignalImage(article),
      },
    };
    next.searchText = searchTextFor(next, excerpt);
    delete next.qualityGateBlockedAt;
    if (!publicSurfaceDecision(next).homepage) {
      if (article.quarantine_reason === 'source_relevance_gate_failed') return article;
      const quarantined = quarantinePublicRecord(article, 'source_relevance_gate_failed');
      if (hash(quarantined) !== hash(article)) {
        rejected.push({ article: quarantined, reason: 'source_relevance_gate_failed' });
      }
      return quarantined;
    }
    if (hash(next) === hash(article)) return article;
    restored.push({ article: next, reason: 'curated_source_signal_restore' });
    return next;
  });
  return { records: repairedRecords, restored, rejected };
}

function resolvedPaths(overrides = {}) {
  return Object.fromEntries(Object.entries({ ...DEFAULT_PATHS, ...overrides }).map(([key, value]) => [
    key,
    path.isAbsolute(value) ? value : path.resolve(ROOT, value),
  ]));
}

async function readRequiredJsonArray(filePath, label) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`cannot read required ${label} data at ${filePath}: ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid JSON in required ${label} data at ${filePath}: ${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`required ${label} data must be a JSON array: ${filePath}`);
  return parsed;
}

function assertCorpusIntegrity(records = []) {
  if (!records.length) throw new Error('public card copy repair refuses an empty corpus');
  const ids = records.map((record) => compact(record?.id));
  if (ids.some((id) => !id)) throw new Error('public card copy repair found a record without an ID');
  if (new Set(ids).size !== ids.length) throw new Error('public card copy repair found duplicate record IDs');
}

function assertSearchIntegrity(search = [], corpus = []) {
  assertCorpusIntegrity(search);
  const expectedIds = new Set(corpus.map((record) => compact(record?.id)));
  const searchIds = new Set(search.map((record) => compact(record?.id)));
  if (expectedIds.size !== searchIds.size || [...expectedIds].some((id) => !searchIds.has(id))) {
    throw new Error('public card copy repair found a search index ID set that differs from the canonical corpus');
  }
}

async function writeTextFile(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, text, 'utf8');
  await fs.rename(temporary, filePath);
}

async function snapshotFiles(filePaths = []) {
  const snapshots = new Map();
  for (const filePath of filePaths) {
    try {
      snapshots.set(filePath, { exists: true, text: await fs.readFile(filePath, 'utf8') });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      snapshots.set(filePath, { exists: false, text: '' });
    }
  }
  return snapshots;
}

async function restoreSnapshots(snapshots) {
  for (const [filePath, snapshot] of snapshots.entries()) {
    if (snapshot.exists) await writeTextFile(filePath, snapshot.text);
    else await fs.rm(filePath, { force: true });
  }
}

async function writeReport({
  before,
  after,
  latestResult,
  archiveResult,
  latestRestore,
  archiveRestore,
  searchArtifactMismatches,
  applied,
  reportPath,
}) {
  const finalQuarantined = after.filter((article) => (
    article.quarantine_reason === 'missing_source_grounded_card_copy'
  ));
  const finalCardQuarantined = after.filter((article) => (
    article.quarantine_reason === 'card_copy_quality_gate_failed'
  ));
  const finalRestored = after.filter((article) => (
    PUBLIC_FEED_RESTORE_IDS.has(article.id)
      && publicSurfaceDecision(article).homepage
  ));
  const report = [
    '# Public Card Copy Repair Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Mode: ${applied ? 'applied' : 'dry-run'}`,
    '',
    '## This Run',
    '',
    `- Records before/after: ${before.length}/${after.length}`,
    `- Records changed: ${latestResult.changed.length + archiveResult.changed.length}`,
    `- Source-excerpt repairs: ${latestResult.repaired.length + archiveResult.repaired.length}`,
    `- Quarantined for missing source-grounded copy: ${latestResult.quarantined.length + archiveResult.quarantined.length}`,
    `- Quarantined by final card quality gate: ${latestResult.cardQuarantined.length + archiveResult.cardQuarantined.length}`,
    `- Source evidence fields repaired: ${latestResult.sourceEvidenceRepaired.length + archiveResult.sourceEvidenceRepaired.length}`,
    `- Search text normalized: ${latestResult.searchNormalized.length + archiveResult.searchNormalized.length}`,
    `- Stale search-index projections detected: ${searchArtifactMismatches}`,
    `- Curated source signals restored: ${latestRestore.restored.length + archiveRestore.restored.length}`,
    `- Curated source signals rejected by final public gate: ${latestRestore.rejected.length + archiveRestore.rejected.length}`,
    `- ID sequence preserved: ${hash(before.map((item) => item.id)) === hash(after.map((item) => item.id))}`,
    `- Non-presentation fields preserved: ${immutableCorpusDigest(before) === immutableCorpusDigest(after)}`,
    '',
    '## Final Corpus State',
    '',
    `- Records: ${after.length}`,
    `- Quarantined for missing source-grounded copy: ${finalQuarantined.length}`,
    `- Quarantined by final card quality gate: ${finalCardQuarantined.length}`,
    `- Curated source signals restored: ${finalRestored.length}`,
    '',
    '## Final Quarantined IDs',
    '',
    ...finalQuarantined.map((article) => `- ${article.id}`),
    '',
    '## Final Card-Quality Quarantined IDs',
    '',
    ...finalCardQuarantined.map((article) => `- ${article.id}`),
    '',
    '## Final Restored Source Signal IDs',
    '',
    ...finalRestored.map((article) => `- ${article.id}`),
  ];
  await writeTextFile(reportPath, `${report.join('\n')}\n`);
}

export async function runPublicCardCopyRepair({
  apply = false,
  paths: pathOverrides = {},
  writeJson = writeJsonFile,
  rebuildTaxonomy = rebuildTaxonomyPages,
} = {}) {
  const paths = resolvedPaths(pathOverrides);
  const [latest, archived, existingSearch] = await Promise.all([
    readRequiredJsonArray(paths.latest, 'latest-news'),
    readRequiredJsonArray(paths.archive, 'archived-news'),
    readRequiredJsonArray(paths.search, 'search-index'),
  ]);
  const before = [...latest, ...archived];
  assertCorpusIntegrity(before);
  assertSearchIntegrity(existingSearch, before);
  const latestResult = repairPublicCardCorpus(latest);
  const archiveResult = repairPublicCardCorpus(archived);
  const latestRestore = restorePublicSourceSignals(latestResult.records);
  const archiveRestore = restorePublicSourceSignals(archiveResult.records);
  const after = [...latestRestore.records, ...archiveRestore.records];
  const canonicalSearchById = new Map(after.map((article) => [article.id, article.searchText || '']));
  const searchArtifactMismatches = existingSearch.filter((article) => (
    article.searchText !== canonicalSearchById.get(article.id)
  )).length;
  assertCorpusIntegrity(after);
  if (before.length !== after.length || hash(before.map((item) => item.id)) !== hash(after.map((item) => item.id))) {
    throw new Error('public card copy repair changed record count or ID order');
  }
  if (immutableCorpusDigest(before) !== immutableCorpusDigest(after)) {
    throw new Error('public card copy repair changed non-presentation fields');
  }

  if (apply) {
    const searchBase = after.map((article) => ({ ...article }));
    const searchIndex = syncArticleImagesById(searchBase, after).updated;
    const transactionPaths = [
      paths.latest,
      paths.archive,
      paths.search,
      paths.taxonomy,
      paths.taxonomyReport,
      paths.report,
    ];
    const snapshots = await snapshotFiles(transactionPaths);
    try {
      await writeJson(paths.latest, latestRestore.records);
      await writeJson(paths.archive, archiveRestore.records);
      await writeJson(paths.search, searchIndex);
      await rebuildTaxonomy({
        paths: {
          latest: paths.latest,
          archive: paths.archive,
          taxonomy: paths.taxonomy,
          report: paths.taxonomyReport,
        },
      });
      await writeReport({
        before,
        after,
        latestResult,
        archiveResult,
        latestRestore,
        archiveRestore,
        searchArtifactMismatches,
        applied: true,
        reportPath: paths.report,
      });
    } catch (error) {
      try {
        await restoreSnapshots(snapshots);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'public card copy repair failed and rollback was incomplete');
      }
      throw error;
    }
  }

  const result = {
    applied: apply,
    records: after.length,
    changed: latestResult.changed.length + archiveResult.changed.length,
    repaired: latestResult.repaired.length + archiveResult.repaired.length,
    quarantined: latestResult.quarantined.length + archiveResult.quarantined.length,
    cardQuarantined: latestResult.cardQuarantined.length + archiveResult.cardQuarantined.length,
    sourceEvidenceRepaired: latestResult.sourceEvidenceRepaired.length + archiveResult.sourceEvidenceRepaired.length,
    searchNormalized: latestResult.searchNormalized.length + archiveResult.searchNormalized.length,
    searchArtifactMismatches,
    restored: latestRestore.restored.length + archiveRestore.restored.length,
    rejected: latestRestore.rejected.length + archiveRestore.rejected.length,
    immutableDigest: immutableCorpusDigest(after),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  await runPublicCardCopyRepair({ apply: process.argv.includes('--apply') });
}
