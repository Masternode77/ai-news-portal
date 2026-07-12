import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_LIMIT,
  LATEST_NEWS_PATH,
  NEWS_POOL_PATH,
  PIPELINE_STATE_PATH,
  PIPELINE_USE_EXISTING_POOL,
  SEARCH_INDEX_PATH,
} from './constants.mjs';
import { readArchiveSnapshot, syncArchiveArtifacts } from './archive-store.mjs';
import {
  classifyExtractedContent,
  extractContentSource,
  generateEditorialMetadata,
} from './content.mjs';
import { planForToday, pickItemsForRun, updatePlanAfterRun } from './curate.mjs';
import {
  attachExpertLensStrict,
  blueprintHistoryFromRecords,
  hydrateExpertLens,
  mergeArticleRecords,
} from './expert-lens.mjs';
import { fetchNewsPool } from './fetch-feeds.mjs';
import { ensureArticleImage, needsImageRefresh } from './image-generator.mjs';
import { canonicalArticleImagePaths } from './image-store.mjs';
import { splitByExpertInsightGate } from './expert-insight-engine.mjs';
import { buildSourceEvidencePack } from './evidence-pack-builder.mjs';
import { sourceFidelityCheck } from './source-fidelity-check.mjs';
import {
  checkClaimsAgainstEvidence,
  seoMetadataClaimsSupported,
} from './source-fidelity-claim-check.mjs';
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

const RETRY_DELAY_MS = Number(process.env.PIPELINE_RETRY_DELAY_MS || 15_000);

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
  return hydrateExpertLens({
    ...item,
    id: item.id || stableArticleId(item.url, item.title),
    source: item.source || 'Legacy Source',
    snippet: item.snippet || truncate(item.summary || item.title, 220),
    contentText: item.contentText || truncate(item.articleText || item.summary || item.snippet || item.title, 800),
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

async function backfillLocalImages(articles = [], { collectOutputs = false } = {}) {
  const results = await Promise.all(articles.map(async (article) => {
    if (!(await needsImageRefresh(article))) return { article, outputPaths: [] };
    let generatedImage;
    try {
      generatedImage = await withTimeout(
        `image refresh ${article.id}`,
        () => ensureArticleImage(article),
        45_000,
      );
    } catch (error) {
      console.warn(`[content-cycle] image refresh skipped for ${article.id} -> ${error.message}`);
      return { article, outputPaths: [] };
    }
    const { slug: _imageSlug, ...imagePaths } = canonicalArticleImagePaths(article, {
      extension: 'webp',
      legacyExtension: 'webp',
    });
    return {
      article: { ...article, ...imagePaths, generatedImage },
      outputPaths: [...new Set([generatedImage, ...Object.values(imagePaths)])],
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

export async function runProductionIngest(payload = {}, context = {}) {
  const now = new Date(payload.now || Date.now());
  const [state, existingLatest, existingArchive] = await Promise.all([
    readPipelineState(PIPELINE_STATE_PATH),
    readJsonFile(LATEST_NEWS_PATH, []),
    readArchiveSnapshot(),
  ]);
  const { pool, fetchedLive } = await loadPool(existingLatest);
  let todayKey = null;
  let plan = null;
  let slot = null;
  let picked = [];
  if (pool.length) {
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
      recentBlueprintIds: blueprintHistoryFromRecords([...(existingLatest || []), ...(existingArchive || [])]),
    },
    discoveries: picked.map((article) => ({ id: article.id, sourceVersion: sourceVersion(article) })),
    transitions: picked.map((article) => transition(
      article,
      'discovered',
      'fetched',
      'feed_item_fetched',
      'The source item was fetched from the configured feed connector.',
    )),
  };
}

export async function runProductionExtract(payload = {}) {
  const extracted = [];
  const extractionFailed = [];
  const transitions = [];
  for (const item of payload.picked || []) {
    try {
      const article = await withTimeout(
        `extract source ${item.id}`,
        () => withSingleRetry(`extract source ${item.id}`, () => extractContentSource(item)),
        75_000,
      );
      extracted.push(article);
      transitions.push(transition(article, 'fetched', 'extracted', 'source_extracted', 'The source body and extraction QA were recorded.'));
    } catch (error) {
      extractionFailed.push({ ...item, extractionFailureCode: error.code || 'source_extraction_failed' });
      transitions.push(transition(item, 'fetched', 'extraction_failed', 'source_extraction_failed', 'The source body could not be extracted after the bounded retry.'));
    }
  }
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

async function generateCandidate(article, recentBlueprintIds) {
  if (article.evidence_pack?.ok !== true || article.evidence_pack?.origin !== 'extraction_only') {
    throw Object.assign(new Error('source evidence pack is missing or invalid'), {
      code: 'editorial_generation_invalid',
    });
  }
  const frozenEvidencePack = structuredClone(article.evidence_pack);
  const metadata = await generateEditorialMetadata(article);
  if (!metadata.ok) throw Object.assign(new Error(metadata.error.code), metadata.error, { retryable: metadata.retryable });
  const generatedImage = await withTimeout(
    `generate image ${article.id}`,
    () => ensureArticleImage({ ...metadata.article, forceAiImage: true, forceImageRefresh: true }),
    45_000,
  );
  const [draft] = await withTimeout(
    `generate editorial draft ${article.id}`,
    () => attachExpertLensStrict([{ ...metadata.article, generatedImage }], { recentBlueprintIds }),
    90_000,
  );
  return { ...draft, evidence_pack: frozenEvidencePack };
}

const DOWNGRADEABLE_GENERATION_FAILURES = new Set([
  'editorial_service_unavailable',
  'editorial_generation_invalid',
  'expert_insight_incomplete',
]);

export async function runProductionGenerate(payload = {}) {
  const generatedDrafts = [];
  const generationFailed = [];
  const recentBlueprintIds = [...(payload.recentBlueprintIds || [])];
  for (const article of payload.editorialCandidates || []) {
    try {
      const draft = await generateCandidate(article, recentBlueprintIds);
      generatedDrafts.push(draft);
      if (draft.article_blueprint) recentBlueprintIds.unshift(draft.article_blueprint);
    } catch (error) {
      if (!DOWNGRADEABLE_GENERATION_FAILURES.has(error?.code)) throw error;
      generationFailed.push(asSignalCard(article, error.code || 'editorial_generation_failed'));
    }
  }
  const signalCards = await backfillLocalImages(payload.signalCards || []);
  const failedSignals = await backfillLocalImages(generationFailed);
  return {
    ok: true,
    value: { ...payload, generatedDrafts, generationFailed: failedSignals, signalCards },
    transitions: (payload.editorialCandidates || []).map((article) => transition(
      article,
      'editorial_candidate',
      'drafting',
      'draft_attempted',
      'The canonical writer attempted source-grounded editorial generation.',
    )),
  };
}

function reviewFidelity(article) {
  const body = article.expertLensFull?.finalArticleBody || '';
  const evidence = article.evidence_pack;
  if (evidence?.ok !== true || evidence?.origin !== 'extraction_only') {
    return {
      ok: false,
      source: { ok: false, unsupported: ['missing_extraction_evidence_pack'] },
      claims: { ok: false, totalClaims: 0, unsupportedClaims: ['missing_extraction_evidence_pack'] },
      seo: { ok: false, totalClaims: 0, unsupportedClaims: ['missing_extraction_evidence_pack'] },
    };
  }
  const source = sourceFidelityCheck(article, evidence, body);
  const claims = checkClaimsAgainstEvidence(body, evidence);
  const seo = seoMetadataClaimsSupported(article, evidence);
  const ok = source.ok === true
    && claims.ok === true
    && (claims.unsupportedClaims?.length || 0) === 0
    && seo.ok === true;
  return { ok, source, claims, seo };
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

export function beginProductionPublication(state, { runId, pipelineVersion, startedAt }) {
  if (typeof runId !== 'string' || !runId.trim()) {
    throw Object.assign(new Error('production publication requires a run id'), { code: 'missing_run_id' });
  }
  const receipts = publicationReceipts(state);
  const prior = receipts[runId];
  if (prior?.status === 'completed') return prior;
  receipts[runId] = {
    runId,
    pipelineVersion,
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
    ...imagePaths,
  ];
}

function assertReusablePublicationReceipt(receipt, context = {}) {
  if (receipt?.runId !== context.runId
    || receipt?.pipelineVersion !== context.pipelineVersion
    || receipt?.result?.outputManifest?.runId !== context.runId) {
    const error = new Error('completed publication receipt does not match the active content cycle');
    error.code = 'publication_receipt_context_mismatch';
    throw error;
  }
}

export async function runProductionPublish(payload = {}, context = {}, dependencies = {}) {
  const services = {
    backfillImages: backfillLocalImages,
    readState: readPipelineState,
    syncArchive: syncArchiveArtifacts,
    writeJson: writeJsonFile,
    writeState: writePipelineState,
    ...dependencies,
  };
  const now = new Date(payload.now || Date.now());
  const [state, durableReceiptState] = await Promise.all([
    services.readState(PIPELINE_STATE_PATH),
    services.receiptStore?.load() || Promise.resolve({ publicationReceipts: {} }),
  ]);
  const existingLatest = payload.existingLatest || [];
  const existingArchive = payload.existingArchive || [];
  const passed = payload.reviewPassed || [];
  const signals = payload.finalSignalCards || payload.signalCards || [];
  const archiveOnly = payload.archiveOnly || [];
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
  const stateReceipt = productionPublicationReceipt(state, context.runId);
  const durableReceipt = productionPublicationReceipt(durableReceiptState, context.runId);
  const completedReceipt = services.receiptStore
    ? (durableReceipt?.status === 'completed' ? durableReceipt : null)
    : (stateReceipt?.status === 'completed' ? stateReceipt : null);
  if (completedReceipt) {
    assertReusablePublicationReceipt(completedReceipt, context);
    if (services.outputBundleStore) {
      await services.outputBundleStore.verifyAndRestore(completedReceipt.result.outputManifest);
    }
    if (durableReceipt?.status !== 'completed' && services.receiptStore) {
      mirrorPublicationReceipt(durableReceiptState, completedReceipt);
      await services.receiptStore.save(durableReceiptState);
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
      await services.writeState(PIPELINE_STATE_PATH, state);
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
  });
  beginProductionPublication(state, {
    runId: context.runId,
    pipelineVersion: context.pipelineVersion,
    startedAt: now.toISOString(),
  });
  if (services.receiptStore) await services.receiptStore.save(durableReceiptState);
  await services.writeState(PIPELINE_STATE_PATH, state);
  const processedIds = new Set(processedItems.map((article) => article.id));
  const existing = dedupeById(existingLatest).filter((article) => !processedIds.has(article.id));
  const retainedArchive = dedupeById(existingArchive).filter((article) => !processedIds.has(article.id));
  const merged = sortForPipelineVisibility(dedupeById([
    ...passed,
    ...signals,
    ...archiveOnly,
    ...existing,
    ...retainedArchive,
  ]));
  const backfillResult = await services.backfillImages(merged, { collectOutputs: true });
  const withImages = Array.isArray(backfillResult) ? backfillResult : backfillResult.articles;
  const refreshedImagePaths = Array.isArray(backfillResult) ? [] : backfillResult.outputPaths;
  const { latest, supabaseStatus } = await services.syncArchive(withImages, retainedArchive);
  await services.writeJson(LATEST_NEWS_PATH, latest);
  if (payload.fetchedLive) await services.writeJson(NEWS_POOL_PATH, payload.pool || []);

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
    supabaseStatus,
  };
  completeProductionPublication(state, {
    runId: context.runId,
    completedAt: now.toISOString(),
    result: publication,
  });
  await services.writeState(PIPELINE_STATE_PATH, state);
  if (services.outputBundleStore) {
    const outputManifest = await services.outputBundleStore.capture(
      context.runId,
      publicationOutputPaths(refreshedImagePaths),
    );
    publication = { ...publication, outputManifest };
  }
  completeProductionPublication(durableReceiptState, {
    runId: context.runId,
    completedAt: now.toISOString(),
    result: publication,
  });
  if (services.receiptStore) await services.receiptStore.save(durableReceiptState);
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
