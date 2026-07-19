import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_LIMIT,
  LATEST_NEWS_PATH,
  NEWS_POOL_PATH,
  PIPELINE_STATE_PATH,
  PIPELINE_USE_EXISTING_POOL,
  SEARCH_INDEX_PATH,
  TAXONOMY_PAGES_PATH,
} from './constants.mjs';
import { readArchiveSnapshot, syncArchiveArtifacts } from './archive-store.mjs';
import {
  classifyExtractedContent,
  extractContentSource,
} from './content.mjs';
import { planForToday, pickItemsForRun, updatePlanAfterRun } from './curate.mjs';
import {
  blueprintHistoryFromRecords,
  hydrateExpertLens,
  mergeArticleRecords,
} from './expert-lens.mjs';
import {
  generateEditorialCandidate,
  reviewCandidateFidelity,
  reviewGeneratedCandidate,
} from './editorial-candidate-lifecycle.mjs';
import { fetchNewsPool } from './fetch-feeds.mjs';
import {
  ensureArticleImageResult,
  imageMetadataPatch,
  needsImageRefresh,
} from './image-generator.mjs';
import { canonicalArticleImagePaths } from './article-image-paths.mjs';
import { splitByExpertInsightGate } from './expert-insight-engine.mjs';
import { buildSourceEvidencePack } from './evidence-pack-builder.mjs';
import {
  ARTICLE_PAGE_QUALITY_THRESHOLD,
  splitByArticleQualityGate,
} from './quality-gate.mjs';
import { splitByInfrastructureRelevance } from './relevance-classifier.mjs';
import { splitByRepetitionGate } from './repetition-detector.mjs';
import { publicSurfaceDecision } from './public-surface-eligibility.mjs';
import { clusterSignalItems } from './signal-clusterer.mjs';
import {
  sourceExtractionPassesLongformGate,
  sourceExtractionPassesPublicGate,
} from './source-extraction-fail-closed.mjs';
import {
  readJsonFile,
  readPipelineState,
  sleep,
  writeJsonFile,
  writePipelineState,
} from './state-store.mjs';
import { stableArticleId, truncate } from './normalize.mjs';
import { buildTaxonomyProjection } from './taxonomy-projection.mjs';
import { uniqueByCanonicalSource } from './canonical-source.mjs';
import {
  buildUpstreamReconciliationAudit,
} from './upstream-content-reconciliation.mjs';
import { loadSourceRegistry } from './source-registry.mjs';
import {
  assertCanonicalSourceCandidateBatch,
  MAX_UPSTREAM_RECONCILIATION_CANDIDATES,
} from '../../src/adapters/upstream-reconciliation-execution.mjs';

const RETRY_DELAY_MS = Number(process.env.PIPELINE_RETRY_DELAY_MS || 15_000);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function withSingleRetry(label, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[content-cycle] ${label} failed; retrying once in ${RETRY_DELAY_MS}ms -> ${error.message}`);
    await sleep(RETRY_DELAY_MS);
    return fn();
  }
}

async function withTimeout(label, fn, timeoutMs = 90_000) {
  let timeoutId;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function sourceVersion(article = {}) {
  return String(article.sourceVersion || article.publishedAt || article.sourceUrl || article.url || 'source-v1');
}

function legacyPoolFromLatest(existingLatest = []) {
  return existingLatest
    .filter((item) => item?.url && item?.title)
    .map((item) => normalizeExistingArticle(item));
}

function normalizeExistingArticle(item) {
  const sourceContent = item.cleaned_source_text
    || item.extractedText
    || item.sourceText
    || item.rawText
    || item.contentText
    || '';
  return hydrateExpertLens({
    ...item,
    id: item.id || stableArticleId(item.url, item.title),
    source: item.source || 'Legacy Source',
    snippet: item.snippet || '',
    contentText: truncate(sourceContent, 800),
    publishedAt: item.publishedAt || new Date().toISOString(),
    sourceImage: item.sourceImage || item.image || null,
    region: item.region || 'Global',
    language: item.language || 'en',
    primary_category: item.primary_category || item.category || item.defaultCategory || null,
    secondary_category: item.secondary_category || null,
    infrastructure_layer: item.infrastructure_layer || null,
    affected_stakeholders: item.affected_stakeholders || [],
    article_type: item.article_type || null,
    urgency_score: item.urgency_score ?? null,
    defaultCategory: item.defaultCategory || item.category || null,
    sourceUrl: item.sourceUrl || item.url,
  });
}

function dedupeById(items = []) {
  const merged = new Map();
  const orderedIds = [];
  for (const item of items) {
    if (!item?.id) continue;
    if (!merged.has(item.id)) {
      orderedIds.push(item.id);
      merged.set(item.id, normalizeExistingArticle(item));
    } else {
      merged.set(item.id, mergeArticleRecords(merged.get(item.id), item));
    }
  }
  return orderedIds.map((id) => merged.get(id));
}

function isHomepageSuppressed(article = {}) {
  if (article.homepageApproved === true || article.manualHomepageApproved === true) return false;
  return article.homepagePublished === false || article.archiveOnly === true;
}

function sortForPipelineVisibility(articles = []) {
  return [...articles].sort((a, b) => {
    const aSuppressed = isHomepageSuppressed(a);
    const bSuppressed = isHomepageSuppressed(b);
    if (aSuppressed !== bSuppressed) return aSuppressed ? 1 : -1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

async function loadPool(existingLatest) {
  if (PIPELINE_USE_EXISTING_POOL) {
    const existingPool = await readJsonFile(NEWS_POOL_PATH, []);
    return { pool: existingPool.length ? existingPool : legacyPoolFromLatest(existingLatest), fetchedLive: false };
  }
  try {
    const pool = await withSingleRetry('fetch pool', () => fetchNewsPool());
    if (pool.length) return { pool, fetchedLive: true };
  } catch (error) {
    console.warn(`[content-cycle] live pool unavailable; using prior pool -> ${error.message}`);
  }
  const fallbackPool = await readJsonFile(NEWS_POOL_PATH, []);
  return {
    pool: fallbackPool.length ? fallbackPool : legacyPoolFromLatest(existingLatest),
    fetchedLive: false,
  };
}

export async function backfillLocalImages(articles = [], {
  collectOutputs = false,
  ensureImage = ensureArticleImageResult,
} = {}) {
  const results = await Promise.all(articles.map(async (article) => {
    if (!(await needsImageRefresh(article))) return { article, outputPaths: [] };
    let imageResult;
    try {
      imageResult = await withTimeout(
        `image refresh ${article.id}`,
        () => ensureImage(article),
        45_000,
      );
    } catch (error) {
      console.warn(`[content-cycle] image refresh skipped for ${article.id} -> ${error.message}`);
      return { article, outputPaths: [] };
    }
    const imagePatch = imageMetadataPatch(imageResult);
    const outputPaths = [
      imagePatch.heroImage,
      imagePatch.thumbnailImage,
      imagePatch.ogImage,
      imagePatch.legacyImage,
    ].filter(Boolean);
    return {
      article: { ...article, ...imagePatch },
      outputPaths: [...new Set(outputPaths)],
    };
  }));
  const updatedArticles = results.map((result) => result.article);
  if (!collectOutputs) return updatedArticles;
  return {
    articles: updatedArticles,
    outputPaths: [...new Set(results.flatMap((result) => result.outputPaths))],
  };
}

function asSignalCard(article, reason) {
  return {
    ...article,
    summary: truncate(article.snippet || article.articleText || article.contentText || article.title, 180),
    insight: '',
    expertLens: null,
    expertLensShort: '',
    expertLensFull: null,
    articlePagePublished: false,
    homepagePublished: true,
    archiveOnly: false,
    signalCardOnly: true,
    signalCardReason: reason,
  };
}

function toRunHistoryItem(article) {
  return {
    id: article.id,
    title: article.title,
    infrastructure_relevance_score: article.infrastructure_relevance_score ?? null,
    infrastructure_relevance_tier: article.infrastructure_relevance_tier ?? null,
    infrastructure_relevance_action: article.infrastructure_relevance_action ?? null,
    extraction_quality_score: article.extraction_quality_score ?? null,
    repetition_blocked: article.repetition_blocked || false,
    reason: article.extractionFailureCode
      || article.qualityGateReason
      || article.expertInsightBlockReason
      || article.signalCardReason
      || article.archiveOnlyReason
      || null,
  };
}

function transition(article, fromState, toState, code, detail) {
  return {
    articleId: article.id,
    fromState,
    toState,
    sourceVersion: sourceVersion(article),
    reason: { code, detail },
  };
}

export function prepareReconciliationCandidates(records, sourceRegistry = []) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('reconciliation requires at least one source discovery row');
  }
  if (records.length > MAX_UPSTREAM_RECONCILIATION_CANDIDATES) {
    throw new Error(`reconciliation accepts at most ${MAX_UPSTREAM_RECONCILIATION_CANDIDATES} source discovery rows`);
  }
  assertCanonicalSourceCandidateBatch(records);

  const audit = buildUpstreamReconciliationAudit([], records, {
    allowedDomains: sourceRegistry.map((source) => source.domain),
  });
  if (audit.rejected.length) {
    throw new Error(`reconciliation rejected ${audit.rejected.length} source discovery row(s)`);
  }
  if (!audit.candidates.length) {
    throw new Error('reconciliation contains no unique source discovery rows');
  }
  return audit.candidates;
}

function reconciliationRevision(value = '') {
  const revision = String(value || '').trim();
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error('reconciliation revision must be a full lowercase commit SHA');
  }
  return revision;
}

export async function runProductionIngest(payload = {}, context = {}, services = {}) {
  const now = new Date(payload.now || Date.now());
  const readState = services.readState || (() => readPipelineState(PIPELINE_STATE_PATH));
  const readLatest = services.readLatest || (() => readJsonFile(LATEST_NEWS_PATH, []));
  const readArchive = services.readArchive || (() => readArchiveSnapshot());
  const [state, existingLatest, existingArchive] = await Promise.all([
    readState(),
    readLatest(),
    readArchive(),
  ]);
  const isReconciliation = Object.hasOwn(payload, 'reconciliationCandidates');
  let pool;
  let fetchedLive;
  let reconciliation = null;
  if (isReconciliation) {
    const loadRegistry = services.loadRegistry || loadSourceRegistry;
    const registry = await loadRegistry();
    pool = prepareReconciliationCandidates(payload.reconciliationCandidates, registry);
    fetchedLive = false;
    reconciliation = {
      revision: reconciliationRevision(payload.reconciliationRevision),
      candidateCount: pool.length,
      allowedDomains: registry.map((source) => source.domain),
    };
  } else {
    ({ pool, fetchedLive } = await loadPool(existingLatest));
  }
  let todayKey = null;
  let plan = null;
  let slot = null;
  let picked = [];
  if (isReconciliation) {
    picked = pool;
  } else if (pool.length) {
    ({ key: todayKey, plan } = await planForToday(pool, state, now));
    ({ slot, picked } = pickItemsForRun(plan, now));
  }
  console.log(`[content-cycle] ingest run=${context.runId} pool=${pool.length} picked=${picked.length}`);
  return {
    ok: true,
    value: {
      now: now.toISOString(),
      state,
      existingLatest,
      existingArchive,
      pool,
      fetchedLive,
      todayKey,
      plan,
      slot,
      picked,
      reconciliation,
      recentBlueprintIds: blueprintHistoryFromRecords([...(existingLatest || []), ...(existingArchive || [])]),
    },
    discoveries: picked.map((article) => ({ id: article.id, sourceVersion: sourceVersion(article) })),
    transitions: picked.map((article) => transition(
      article,
      'discovered',
      'fetched',
      isReconciliation ? 'upstream_source_reconciliation' : 'feed_item_fetched',
      isReconciliation
        ? 'The source discovery was admitted for fresh extraction through the canonical lifecycle.'
        : 'The source item was fetched from the configured feed connector.',
    )),
  };
}

function reconciliationCandidateCount(payload = {}) {
  if (!payload.reconciliation) return null;
  const candidateCount = payload.reconciliation.candidateCount;
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1) {
    const error = new Error('upstream reconciliation has an invalid candidate count');
    error.code = 'reconciliation_candidate_count_invalid';
    throw error;
  }
  return candidateCount;
}

export function assertReconciliationExtractionProgress(payload = {}, extracted = []) {
  const candidateCount = reconciliationCandidateCount(payload);
  if (candidateCount === null) return;
  if (extracted.length === 0) {
    const error = new Error(
      `upstream reconciliation extracted 0 of ${candidateCount} candidates; refusing to complete`,
    );
    error.code = 'reconciliation_extraction_empty';
    throw error;
  }
}

export function assertReconciliationClassificationProgress(payload = {}, cleanSources = []) {
  const candidateCount = reconciliationCandidateCount(payload);
  if (candidateCount === null) return;
  if (cleanSources.length === 0) {
    const error = new Error(
      `upstream reconciliation: 0 of ${candidateCount} candidates passed source extraction QA`,
    );
    error.code = 'reconciliation_classification_empty';
    throw error;
  }
}

export async function runProductionExtract(payload = {}, _context = {}, services = {}) {
  const extractSource = services.extractSource || extractContentSource;
  const retry = services.retry || withSingleRetry;
  const extracted = [];
  const extractionFailed = [];
  const transitions = [];
  for (const item of payload.picked || []) {
    try {
      const article = await withTimeout(
        `extract source ${item.id}`,
        () => retry(
          `extract source ${item.id}`,
          () => extractSource(item, {
            allowedDomains: payload.reconciliation?.allowedDomains,
          }),
        ),
        75_000,
      );
      extracted.push(article);
      transitions.push(transition(article, 'fetched', 'extracted', 'source_extracted', 'The source body and extraction QA were recorded.'));
    } catch (error) {
      extractionFailed.push({ ...item, extractionFailureCode: error.code || 'source_extraction_failed' });
      transitions.push(transition(item, 'fetched', 'extraction_failed', 'source_extraction_failed', 'The source body could not be extracted after the bounded retry.'));
    }
  }
  assertReconciliationExtractionProgress(payload, extracted);
  return { ok: true, value: { ...payload, extracted, extractionFailed }, transitions };
}

export async function runProductionClassify(payload = {}) {
  const cleanSources = [];
  const classificationRejected = [];
  const transitions = [];
  for (const extracted of payload.extracted || []) {
    const article = classifyExtractedContent(extracted);
    const publicExtraction = sourceExtractionPassesPublicGate(article);
    if ((article.extraction_quality_score ?? 0) >= 0.5 && publicExtraction.ok) {
      cleanSources.push(article);
      transitions.push(transition(article, 'extracted', 'clean_source', 'source_quality_passed', 'Extraction evidence passed the minimum public classification boundary.'));
    } else {
      classificationRejected.push({
        ...article,
        qualityGateReason: 'source_extraction_fail_closed',
        extractionBlockReasons: publicExtraction.block_reasons,
      });
      transitions.push(transition(article, 'extracted', 'extraction_failed', 'source_quality_failed', 'Extraction evidence failed the public classification boundary.'));
    }
  }
  assertReconciliationClassificationProgress(payload, cleanSources);
  return { ok: true, value: { ...payload, cleanSources, classificationRejected }, transitions };
}

function clusterCandidates(articles = []) {
  const normalized = articles.map((article) => ({
    ...article,
    source_name: article.source,
    source_published_at: article.publishedAt,
    companies: article.named_companies || article.expert_insight?.named_companies || [],
  }));
  const clusters = clusterSignalItems(normalized);
  const candidates = [];
  const duplicates = [];
  for (const cluster of clusters) {
    const [representative, ...supporting] = cluster.source_items;
    if (representative) candidates.push({ ...representative, signal_cluster_id: cluster.cluster_id, signal_source_count: cluster.source_count });
    duplicates.push(...supporting.map((article) => ({ ...article, duplicateOf: representative?.id, signal_cluster_id: cluster.cluster_id })));
  }
  return { clusters, candidates, duplicates };
}

export async function runProductionCluster(payload = {}) {
  const { fullMemoCandidates, signalCards: relevanceSignals, archiveOnly } = splitByInfrastructureRelevance(payload.cleanSources || []);
  const longformEligible = [];
  const sourceOnly = [];
  for (const article of fullMemoCandidates) {
    const extraction = sourceExtractionPassesLongformGate(article);
    if (extraction.ok) longformEligible.push(article);
    else sourceOnly.push({ ...article, longformBlockReasons: extraction.block_reasons });
  }
  const { publishable: qualityPublishable, blocked: qualityBlocked } = splitByArticleQualityGate(
    longformEligible,
    ARTICLE_PAGE_QUALITY_THRESHOLD,
  );
  const evidenceReady = [];
  const evidenceBlocked = [];
  for (const article of qualityPublishable) {
    const evidencePack = buildSourceEvidencePack(article);
    if (evidencePack.ok) evidenceReady.push({ ...article, evidence_pack: evidencePack });
    else evidenceBlocked.push({ ...article, evidence_pack: evidencePack });
  }
  const { publishable: insightPublishable, blocked: insightBlocked } = splitByExpertInsightGate(evidenceReady);
  const { clusters, candidates: editorialCandidates, duplicates } = clusterCandidates(insightPublishable);
  const signalCards = [
    ...relevanceSignals.map((article) => asSignalCard(article, 'infrastructure_relevance_signal_card_threshold')),
    ...sourceOnly.map((article) => asSignalCard(article, 'source_evidence_insufficient_for_longform')),
    ...qualityBlocked.map((article) => asSignalCard(article, article.qualityGateReason || 'extraction_quality_blocked')),
    ...evidenceBlocked.map((article) => asSignalCard(article, 'source_evidence_pack_incomplete')),
    ...insightBlocked.map((article) => asSignalCard(article, article.expertInsightBlockReason || 'expert_insight_incomplete')),
  ];
  const transitions = [
    ...editorialCandidates.map((article) => transition(article, 'clean_source', 'editorial_candidate', 'editorial_candidate_selected', 'The clean source passed relevance, quality, insight, and cluster selection.')),
    ...signalCards.map((article) => transition(article, 'clean_source', 'source_signal', 'source_signal_selected', 'The clean source was retained as a source-linked signal without local longform.')),
    ...archiveOnly.map((article) => transition(article, 'clean_source', 'low_relevance', 'low_relevance_archived', 'The source did not meet the core or adjacent infrastructure boundary.')),
    ...duplicates.map((article) => transition(article, 'clean_source', 'duplicate', 'signal_cluster_duplicate', `The source supports the same signal as ${article.duplicateOf || 'the representative item'}.`)),
  ];
  return {
    ok: true,
    value: {
      ...payload,
      clusters,
      editorialCandidates,
      duplicates,
      signalCards,
      archiveOnly,
      blocked: [...qualityBlocked, ...evidenceBlocked, ...insightBlocked],
    },
    transitions,
  };
}

export async function generateCandidate(article, recentBlueprintIds, dependencies = {}) {
  const ensureImage = dependencies.ensureImage || ensureArticleImageResult;
  return generateEditorialCandidate(article, recentBlueprintIds, {
    generateMetadata: dependencies.generateMetadata,
    attachLens: dependencies.attachLens,
    transformDraftOutput: dependencies.generateImage === false
      ? undefined
      : async (draftArticle) => {
        const imageResult = await withTimeout(
          `generate image ${article.id}`,
          () => ensureImage({
            ...draftArticle,
            forceAiImage: true,
            forceImageRefresh: true,
            requireProviderImage: dependencies.requireProviderImage === true,
          }),
          45_000,
        );
        return { ...draftArticle, ...imageMetadataPatch(imageResult) };
      },
  });
}

const DOWNGRADEABLE_GENERATION_FAILURES = new Set([
  'editorial_service_unavailable',
  'editorial_generation_invalid',
  'expert_insight_incomplete',
]);

function reconciliationImage2Error(message) {
  return Object.assign(new Error(message), { code: 'reconciliation_image2_required' });
}

function assertImage2Article(article = {}, claimedPaths = null) {
  const imagePaths = [
    article.heroImage,
    article.thumbnailImage,
    article.ogImage,
    article.legacyImage,
  ];
  const expected = canonicalArticleImagePaths(article, {
    extension: 'webp',
    legacyExtension: 'webp',
  });
  const expectedPaths = [
    expected.heroImage,
    expected.thumbnailImage,
    expected.ogImage,
    expected.legacyImage,
  ];
  const canonicalPaths = imagePaths.every((value, index) => value === expectedPaths[index])
    && new Set(imagePaths).size === imagePaths.length;
  if (article.imageProvider !== 'image2'
    || article.imageStatus !== 'generated'
    || !canonicalPaths) {
    throw reconciliationImage2Error(
      `upstream reconciliation requires a fresh Image2 image set for ${article.id || 'unknown article'}`,
    );
  }
  for (const imagePath of imagePaths) {
    if (claimedPaths?.has(imagePath)) {
      throw reconciliationImage2Error(
        `upstream reconciliation cannot reuse Image2 output ${imagePath}`,
      );
    }
    claimedPaths?.add(imagePath);
  }
  return article;
}

async function verifyReconciliationImageFiles(articles = []) {
  const generatedRoot = path.resolve(PROJECT_ROOT, 'public/generated');
  const realGeneratedRoot = await fs.realpath(generatedRoot);
  const publicPaths = articles.flatMap((article) => [
    article.heroImage,
    article.thumbnailImage,
    article.ogImage,
    article.legacyImage,
  ]);
  for (const publicPath of new Set(publicPaths)) {
    const filePath = path.resolve(PROJECT_ROOT, `public${publicPath}`);
    if (!filePath.startsWith(`${generatedRoot}${path.sep}`)) {
      throw reconciliationImage2Error(`Image2 output escaped generated storage: ${publicPath}`);
    }
    let fileStat;
    let realPath;
    try {
      [fileStat, realPath] = await Promise.all([fs.lstat(filePath), fs.realpath(filePath)]);
    } catch {
      throw reconciliationImage2Error(`Image2 output is missing: ${publicPath}`);
    }
    if (!fileStat.isFile()
      || fileStat.isSymbolicLink()
      || fileStat.size < 1
      || !realPath.startsWith(`${realGeneratedRoot}${path.sep}`)) {
      throw reconciliationImage2Error(`Image2 output is not a regular generated file: ${publicPath}`);
    }
  }
}

async function generateRequiredImage2Articles(articles = [], ensureImage = ensureArticleImageResult) {
  const generated = [];
  for (const article of articles) {
    const imageResult = await withTimeout(
      `generate required Image2 image ${article.id}`,
      () => ensureImage({
        ...article,
        forceAiImage: true,
        forceImageRefresh: true,
        requireProviderImage: true,
      }),
      45_000,
    );
    generated.push(assertImage2Article({ ...article, ...imageMetadataPatch(imageResult) }));
  }
  return generated;
}

function uniqueArticleCount(articles = []) {
  return new Set(articles.map((article) => article?.id).filter(Boolean)).size;
}

export function assertReconciliationProviderCompletion(payload = {}, publicUpdates = []) {
  if (!payload.reconciliation) return;
  const evidence = payload.reconciliationProviders;
  const editorialRequired = uniqueArticleCount(payload.editorialCandidates || []);
  const image2Required = uniqueArticleCount(publicUpdates);
  const providerCountsValid = evidence
    && evidence.editorialRequired === editorialRequired
    && evidence.editorialSucceeded === editorialRequired
    && evidence.image2Required === image2Required
    && evidence.image2Succeeded === image2Required;
  try {
    const claimedPaths = new Set();
    for (const article of publicUpdates) assertImage2Article(article, claimedPaths);
  } catch (error) {
    const completionError = new Error(error.message);
    completionError.code = 'reconciliation_provider_completion_invalid';
    throw completionError;
  }
  if (!providerCountsValid) {
    const error = new Error('upstream reconciliation provider completion evidence is incomplete');
    error.code = 'reconciliation_provider_completion_invalid';
    throw error;
  }
}

export async function runProductionGenerate(payload = {}, _context = {}, dependencies = {}) {
  const isReconciliation = reconciliationCandidateCount(payload) !== null;
  const generatedDrafts = [];
  const generationFailed = [];
  const recentBlueprintIds = [...(payload.recentBlueprintIds || [])];
  for (const article of payload.editorialCandidates || []) {
    try {
      const draft = await generateCandidate(article, recentBlueprintIds, {
        ...dependencies,
        requireProviderImage: isReconciliation,
      });
      generatedDrafts.push(isReconciliation ? assertImage2Article(draft) : draft);
      if (draft.article_blueprint) recentBlueprintIds.unshift(draft.article_blueprint);
    } catch (error) {
      if (isReconciliation) throw error;
      if (!DOWNGRADEABLE_GENERATION_FAILURES.has(error?.code)) throw error;
      generationFailed.push(asSignalCard(article, error.code || 'editorial_generation_failed'));
    }
  }
  const ensureImage = dependencies.ensureImage || ensureArticleImageResult;
  const signalCards = isReconciliation
    ? await generateRequiredImage2Articles(payload.signalCards || [], ensureImage)
    : await backfillLocalImages(payload.signalCards || [], { ensureImage });
  const archiveOnly = isReconciliation
    ? await generateRequiredImage2Articles(payload.archiveOnly || [], ensureImage)
    : payload.archiveOnly;
  const failedSignals = await backfillLocalImages(generationFailed, { ensureImage });
  const image2Articles = [...generatedDrafts, ...signalCards, ...(archiveOnly || [])];
  const reconciliationProviders = isReconciliation ? {
    editorialRequired: uniqueArticleCount(payload.editorialCandidates || []),
    editorialSucceeded: uniqueArticleCount(generatedDrafts),
    image2Required: uniqueArticleCount(image2Articles),
    image2Succeeded: uniqueArticleCount(image2Articles),
  } : undefined;
  return {
    ok: true,
    value: {
      ...payload,
      generatedDrafts,
      generationFailed: failedSignals,
      signalCards,
      archiveOnly,
      ...(reconciliationProviders ? { reconciliationProviders } : {}),
    },
    transitions: (payload.editorialCandidates || []).map((article) => transition(
      article,
      'editorial_candidate',
      'drafting',
      'draft_attempted',
      'The canonical writer attempted source-grounded editorial generation.',
    )),
  };
}

export { reviewGeneratedCandidate };

function reviewFidelity(article) {
  return reviewCandidateFidelity(article);
}

export async function runProductionReview(payload = {}) {
  const fidelityPassed = [];
  const fidelityBlocked = [];
  for (const article of payload.generatedDrafts || []) {
    const fidelity = reviewFidelity(article);
    const reviewed = {
      ...article,
      source_fidelity: fidelity.source,
      claim_fidelity: fidelity.claims,
      seo_fidelity: fidelity.seo,
    };
    if (fidelity.ok) fidelityPassed.push(reviewed);
    else fidelityBlocked.push({ ...reviewed, reviewFailureCode: 'source_fidelity_failed' });
  }
  const { passed: repetitionPassed, blocked: repetitionBlocked } = splitByRepetitionGate(
    fidelityPassed,
    [...(payload.existingLatest || []), ...(payload.existingArchive || [])],
  );
  const publicEligible = [];
  const publicBlocked = [];
  for (const article of repetitionPassed) {
    const decision = publicSurfaceDecision(article);
    const reviewed = {
      ...article,
      public_eligibility: {
        detailPage: decision.detailPage,
        homepage: decision.homepage,
        archive: decision.archive,
        rss: decision.rss,
        sourceRelevant: decision.sourceRelevant,
      },
    };
    if (decision.detailPage) publicEligible.push(reviewed);
    else publicBlocked.push({ ...reviewed, reviewFailureCode: 'public_longform_ineligible' });
  }
  const reviewFailed = [
    ...(payload.generationFailed || []),
    ...fidelityBlocked,
    ...repetitionBlocked,
    ...publicBlocked,
  ].map((article) => asSignalCard(
    article,
    article.reviewFailureCode || article.signalCardReason || 'editorial_review_failed',
  ));
  const transitions = [];
  for (const article of publicEligible) {
    transitions.push(transition(article, 'drafting', 'publish_ready', 'editorial_review_passed', 'The draft passed source fidelity, claim, SEO, repetition, and public longform eligibility review.'));
  }
  for (const article of reviewFailed) {
    transitions.push(transition(article, 'drafting', 'review_failed', 'editorial_review_failed', 'The draft failed generation or editorial review and cannot publish as local longform.'));
    transitions.push(transition(article, 'review_failed', 'source_signal', 'review_failure_downgrade', 'The failed draft was downgraded to a source-linked signal.'));
  }
  return {
    ok: true,
    value: {
      ...payload,
      reviewPassed: publicEligible,
      reviewFailed,
      finalSignalCards: [...(payload.signalCards || []), ...reviewFailed],
    },
    transitions,
  };
}

function recordRun(state, entry) {
  const prior = Array.isArray(state.runHistory) ? state.runHistory : [];
  if (prior.some((item) => item.runId === entry.runId)) return;
  prior.push(entry);
  state.runHistory = prior.slice(-120);
}

const PUBLICATION_RECEIPT_LIMIT = 120;

function publicationReceipts(state) {
  if (!state.publicationReceipts
    || typeof state.publicationReceipts !== 'object'
    || Array.isArray(state.publicationReceipts)) {
    state.publicationReceipts = {};
  }
  return state.publicationReceipts;
}

function trimPublicationReceipts(state) {
  const receipts = publicationReceipts(state);
  const oldestFirst = Object.entries(receipts).sort((left, right) => (
    Date.parse(left[1]?.completedAt || left[1]?.startedAt || 0)
      - Date.parse(right[1]?.completedAt || right[1]?.startedAt || 0)
  ));
  for (const [runId] of oldestFirst.slice(0, Math.max(0, oldestFirst.length - PUBLICATION_RECEIPT_LIMIT))) {
    delete receipts[runId];
  }
}

export function productionPublicationReceipt(state, runId) {
  return publicationReceipts(state)[runId] || null;
}

export function beginProductionPublication(state, {
  runId,
  pipelineVersion,
  startedAt,
  executionIdentity = null,
}) {
  if (typeof runId !== 'string' || !runId.trim()) {
    throw Object.assign(new Error('production publication requires a run id'), { code: 'missing_run_id' });
  }
  const receipts = publicationReceipts(state);
  const prior = receipts[runId];
  if (prior?.status === 'completed') return prior;
  receipts[runId] = {
    runId,
    pipelineVersion,
    ...(executionIdentity ? { executionIdentity: structuredClone(executionIdentity) } : {}),
    status: 'preparing',
    startedAt: prior?.startedAt || startedAt,
    attempts: Number(prior?.attempts || 0) + 1,
  };
  trimPublicationReceipts(state);
  return receipts[runId];
}

export function completeProductionPublication(state, { runId, completedAt, result }) {
  const receipts = publicationReceipts(state);
  const prior = receipts[runId];
  if (!prior) {
    throw Object.assign(new Error('production publication receipt was not prepared'), {
      code: 'publication_receipt_missing',
    });
  }
  receipts[runId] = {
    ...prior,
    status: 'completed',
    completedAt,
    result: structuredClone(result),
  };
  trimPublicationReceipts(state);
  return receipts[runId];
}

export function buildProductionPublishAccounting({
  passed = [],
  signals = [],
  archiveOnly = [],
  duplicates = [],
  extractionFailed = [],
  classificationRejected = [],
  blocked = [],
} = {}) {
  const rejected = [...extractionFailed, ...classificationRejected];
  const publicUpdates = [...passed, ...signals, ...archiveOnly, ...duplicates];
  return {
    rejected,
    publicUpdates,
    processedItems: [...publicUpdates, ...rejected],
    blockedItems: [...blocked, ...rejected],
  };
}

function applyPublicationMetadata({
  state,
  payload,
  context,
  now,
  processedItems,
  blockedItems,
  passed,
  signals,
  archiveOnly,
}) {
  if (payload.plan && payload.todayKey && payload.slot) {
    state.dayPlans ||= {};
    state.dayPlans[payload.todayKey] = updatePlanAfterRun(payload.plan, processedItems, payload.slot);
  }
  state.publishedIds = [...new Set([
    ...(state.publishedIds || []),
    ...processedItems.map((article) => article.id),
  ])].slice(-1000);
  state.lastRunAt = now.toISOString();
  recordRun(state, {
    runId: context.runId,
    at: now.toISOString(),
    day: payload.todayKey,
    slot: payload.slot,
    publishedCount: passed.length,
    signalCardCount: signals.length,
    archiveOnlyCount: archiveOnly.length,
    processedIds: processedItems.map((article) => article.id),
    blockedCount: blockedItems.length,
    blockedItems: blockedItems.map(toRunHistoryItem),
  });
}

function mirrorPublicationReceipt(state, receipt) {
  publicationReceipts(state)[receipt.runId] = structuredClone(receipt);
  trimPublicationReceipts(state);
}

function publicationOutputPaths(imageOutputs = []) {
  const imagePaths = imageOutputs
    .filter((value) => typeof value === 'string' && /^\/generated\//.test(value))
    .map((value) => `public${value.split(/[?#]/, 1)[0]}`);
  return [
    PIPELINE_STATE_PATH,
    LATEST_NEWS_PATH,
    NEWS_POOL_PATH,
    ARCHIVE_NEWS_PATH,
    SEARCH_INDEX_PATH,
    TAXONOMY_PAGES_PATH,
    ...imagePaths,
  ];
}

function assertReusablePublicationReceipt(receipt, context = {}) {
  if (receipt?.runId !== context.runId
    || receipt?.pipelineVersion !== context.pipelineVersion
    || receipt?.result?.outputManifest?.runId !== context.runId
    || JSON.stringify(receipt?.executionIdentity ?? null)
      !== JSON.stringify(context.executionIdentity ?? null)) {
    const error = new Error('completed publication receipt does not match the active content cycle');
    error.code = 'publication_receipt_context_mismatch';
    throw error;
  }
}

export async function runProductionPublish(payload = {}, context = {}, dependencies = {}) {
  const services = {
    backfillImages: backfillLocalImages,
    buildTaxonomy: buildTaxonomyProjection,
    publicDecision: publicSurfaceDecision,
    readState: readPipelineState,
    syncArchive: syncArchiveArtifacts,
    verifyReconciliationImages: verifyReconciliationImageFiles,
    writeJson: writeJsonFile,
    writeState: writePipelineState,
    ...dependencies,
  };
  const assertExecutionOwnership = typeof context.assertExecutionOwnership === 'function'
    ? context.assertExecutionOwnership
    : async () => {};
  const fenced = async (operation) => {
    await assertExecutionOwnership();
    const result = await operation();
    await assertExecutionOwnership();
    return result;
  };
  const now = new Date(payload.now || Date.now());
  const existingLatest = payload.existingLatest || [];
  const existingArchive = payload.existingArchive || [];
  const passed = payload.reviewPassed || [];
  const signals = payload.finalSignalCards || payload.signalCards || [];
  const archiveOnly = payload.archiveOnly || [];
  const publishableUpdates = [...passed, ...signals, ...archiveOnly];
  const {
    publicUpdates,
    processedItems,
    blockedItems,
  } = buildProductionPublishAccounting({
    passed,
    signals,
    archiveOnly,
    duplicates: payload.duplicates,
    extractionFailed: payload.extractionFailed,
    classificationRejected: payload.classificationRejected,
    blocked: payload.blocked,
  });
  assertReconciliationProviderCompletion(payload, publishableUpdates);
  const processedIds = new Set(processedItems.map((article) => article.id));
  const existing = dedupeById(existingLatest).filter((article) => !processedIds.has(article.id));
  const retainedArchive = dedupeById(existingArchive).filter((article) => !processedIds.has(article.id));
  const mergedById = sortForPipelineVisibility(dedupeById([
    ...passed,
    ...signals,
    ...archiveOnly,
    ...existing,
    ...retainedArchive,
  ]));
  const merged = uniqueByCanonicalSource(mergedById, {
    isEligible: (article) => {
      const decision = services.publicDecision(article);
      return decision.homepage === true || decision.archive === true;
    },
  });
  let withImages = merged;
  let refreshedImagePaths = [];
  if (payload.reconciliation) {
    await services.verifyReconciliationImages(publishableUpdates);
    refreshedImagePaths = publishableUpdates.flatMap((article) => [
      article.heroImage,
      article.thumbnailImage,
      article.ogImage,
      article.legacyImage,
    ]);
  }
  await assertExecutionOwnership();
  const [state, durableReceiptState] = await Promise.all([
    services.readState(PIPELINE_STATE_PATH),
    services.receiptStore?.load() || Promise.resolve({ publicationReceipts: {} }),
  ]);
  await assertExecutionOwnership();
  const stateReceipt = productionPublicationReceipt(state, context.runId);
  const durableReceipt = productionPublicationReceipt(durableReceiptState, context.runId);
  const completedReceipt = services.receiptStore
    ? (durableReceipt?.status === 'completed' ? durableReceipt : null)
    : (stateReceipt?.status === 'completed' ? stateReceipt : null);
  if (completedReceipt) {
    assertReusablePublicationReceipt(completedReceipt, context);
    if (services.outputBundleStore) {
      await fenced(() => services.outputBundleStore.verifyAndRestore(
        completedReceipt.result.outputManifest,
      ));
    }
    if (durableReceipt?.status !== 'completed' && services.receiptStore) {
      mirrorPublicationReceipt(durableReceiptState, completedReceipt);
      await fenced(() => services.receiptStore.save(durableReceiptState));
    }
    if (stateReceipt?.status !== 'completed') {
      applyPublicationMetadata({
        state,
        payload,
        context,
        now,
        processedItems,
        blockedItems,
        passed,
        signals,
        archiveOnly,
      });
      mirrorPublicationReceipt(state, completedReceipt);
      await fenced(() => services.writeState(PIPELINE_STATE_PATH, state));
    }
    console.log(`[content-cycle] publish replay run=${context.runId}`);
    return {
      ok: true,
      value: { ...payload, publication: structuredClone(completedReceipt.result) },
      transitions: passed.map((article) => transition(article, 'publish_ready', 'published', 'article_published', 'The reviewed article was committed to the public read model.')),
    };
  }
  beginProductionPublication(durableReceiptState, {
    runId: context.runId,
    pipelineVersion: context.pipelineVersion,
    startedAt: now.toISOString(),
    executionIdentity: context.executionIdentity,
  });
  beginProductionPublication(state, {
    runId: context.runId,
    pipelineVersion: context.pipelineVersion,
    startedAt: now.toISOString(),
    executionIdentity: context.executionIdentity,
  });
  if (services.receiptStore) await fenced(() => services.receiptStore.save(durableReceiptState));
  await fenced(() => services.writeState(PIPELINE_STATE_PATH, state));
  if (!payload.reconciliation) {
    const backfillResult = await fenced(
      () => services.backfillImages(merged, { collectOutputs: true }),
    );
    withImages = Array.isArray(backfillResult) ? backfillResult : backfillResult.articles;
    refreshedImagePaths = Array.isArray(backfillResult) ? [] : backfillResult.outputPaths;
  }
  const { latest, archive = retainedArchive, supabaseStatus } = await fenced(
    () => services.syncArchive(withImages, retainedArchive),
  );
  await fenced(() => services.writeJson(LATEST_NEWS_PATH, latest));
  const taxonomy = services.buildTaxonomy([...latest, ...archive]);
  await fenced(() => services.writeJson(TAXONOMY_PAGES_PATH, taxonomy));
  if (payload.fetchedLive) {
    await fenced(() => services.writeJson(NEWS_POOL_PATH, payload.pool || []));
  }

  applyPublicationMetadata({
    state,
    payload,
    context,
    now,
    processedItems,
    blockedItems,
    passed,
    signals,
    archiveOnly,
  });
  let publication = {
    latestCount: latest.slice(0, LATEST_NEWS_LIMIT).length,
    publishedCount: passed.length,
    signalCardCount: signals.length,
    archiveOnlyCount: archiveOnly.length,
    removedFailClosedCount: processedItems.length - publicUpdates.length,
    taxonomyCategoryCount: taxonomy.categories.length,
    supabaseStatus,
  };
  completeProductionPublication(state, {
    runId: context.runId,
    completedAt: now.toISOString(),
    result: publication,
  });
  await fenced(() => services.writeState(PIPELINE_STATE_PATH, state));
  if (services.outputBundleStore) {
    const outputManifest = await fenced(
      () => services.outputBundleStore.capture(
        context.runId,
        publicationOutputPaths(refreshedImagePaths),
      ),
    );
    publication = { ...publication, outputManifest };
  }
  completeProductionPublication(durableReceiptState, {
    runId: context.runId,
    completedAt: now.toISOString(),
    result: publication,
  });
  if (services.receiptStore) await fenced(() => services.receiptStore.save(durableReceiptState));
  console.log(`[content-cycle] publish run=${context.runId} longform=${passed.length} signals=${signals.length} archive=${archiveOnly.length}`);
  return {
    ok: true,
    value: {
      ...payload,
      publication,
    },
    transitions: passed.map((article) => transition(article, 'publish_ready', 'published', 'article_published', 'The reviewed article was committed to the public read model.')),
  };
}
