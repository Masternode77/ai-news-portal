import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  assertReconciliationClassificationProgress,
  assertReconciliationExtractionProgress,
  assertReconciliationProviderCompletion,
  beginProductionPublication,
  buildProductionPublishAccounting,
  completeProductionPublication,
  generateCandidate,
  productionPublicationReceipt,
  prepareReconciliationCandidates,
  reviewGeneratedCandidate,
  runProductionClassify,
  runProductionCluster,
  runProductionGenerate,
  runProductionIngest,
  runProductionReview,
  runProductionPublish,
} from '../scripts/lib/production-content-phases.mjs';
import { publicSurfaceDecision } from '../scripts/lib/public-surface-eligibility.mjs';
import { syncArchiveArtifacts } from '../scripts/lib/archive-store.mjs';
import { buildEvidencePack, buildSourceEvidencePack } from '../scripts/lib/evidence-pack-builder.mjs';
import {
  CURATED_ARTICLE_ID,
  repairPublicLongformRecord,
} from '../scripts/repair-public-longform-inventory.mjs';
import { sourceCandidateFromUpstream } from '../scripts/lib/upstream-content-reconciliation.mjs';
import { canonicalArticleImagePaths } from '../scripts/lib/article-image-paths.mjs';

const PROJECT_ROOT = process.cwd();

async function writeGeneratedImageFixtures(t, article) {
  const paths = canonicalArticleImagePaths(article, {
    extension: 'webp',
    legacyExtension: 'webp',
  });
  const publicPaths = [
    paths.heroImage,
    paths.thumbnailImage,
    paths.ogImage,
    paths.legacyImage,
  ];
  for (const publicPath of publicPaths) {
    const filePath = path.join(PROJECT_ROOT, 'public', publicPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `image2-fixture:${article.id}:${publicPath}`);
  }
  t.after(async () => {
    await Promise.all(publicPaths.map((publicPath) => fs.rm(
      path.join(PROJECT_ROOT, 'public', publicPath),
      { force: true },
    )));
    await fs.rm(path.dirname(path.join(PROJECT_ROOT, 'public', paths.heroImage)), {
      force: true,
      recursive: true,
    });
  });
  return paths;
}

function sourceText(minimumLength) {
  const sentences = [
    'The utility approved a new interconnection plan for an AI data center campus in Virginia.',
    'The first phase covers 120 megawatts and depends on transformer delivery before energization.',
    'The developer said construction is underway while the cloud tenant completes network design.',
    'The filing identifies substation work, cooling equipment, and commissioning as separate milestones.',
    'The disclosed schedule does not establish when every planned building will enter service.',
  ];
  let text = '';
  let index = 0;
  while (text.length < minimumLength) {
    text += `${sentences[index % sentences.length]} `;
    index += 1;
  }
  return text.trim();
}

function extractedArticle({ id, length, score = 0.94 }) {
  const articleText = sourceText(length);
  return {
    id,
    title: 'Utility clears 120 MW interconnection plan for Virginia AI campus',
    source: 'Test Wire',
    url: `https://example.com/${id}`,
    sourceUrl: `https://example.com/${id}`,
    snippet: 'The project depends on transformer delivery and substation commissioning.',
    publishedAt: '2026-07-12T00:00:00.000Z',
    articleText,
    content_length: articleText.length,
    extraction_quality_score: score,
    extraction_qa: { extraction_quality_score: score },
  };
}

function curatedLongformInput() {
  return {
    ...extractedArticle({ id: CURATED_ARTICLE_ID, length: 1_300 }),
    title: 'A contracted campus still has to reach energization',
    source: 'Infrastructure Filing',
    sourceUrl: 'https://example.com/campus',
    public_content_tier: 'longform_analysis',
    public_status: 'published',
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    signalCardOnly: false,
    noindex: false,
    seo_noindex: false,
    infrastructure_relevance_score: 0.9,
    infrastructure_relevance_action: 'generate_full_memo',
    infrastructureRelevanceAction: 'generate_full_memo',
    infrastructure_relevance: {
      infrastructure_relevance_tier: 'full_memo',
      infrastructure_relevance_action: 'generate_full_memo',
      infrastructureRelevanceAction: 'generate_full_memo',
      articlePagePublished: true,
      homepagePublished: true,
      archiveOnly: false,
    },
    expertLensFull: { finalArticleBody: 'A short body cannot support a public analysis page.' },
    public_routing: { visibility: 'core' },
  };
}

function outputManifest(runId) {
  return { schemaVersion: 1, runId, files: [] };
}

function reconciliationCandidate(overrides = {}) {
  return sourceCandidateFromUpstream({
    title: 'Utility files 300 MW interconnection plan for an AI data center',
    source: 'Test Infrastructure Wire',
    url: 'https://example.com/grid-plan',
    publishedAt: '2026-07-18T00:00:00.000Z',
    snippet: 'The filing identifies a substation schedule and transformer delivery dependency.',
    ...overrides,
  });
}

test('reconciliation candidates enter production ingest as source-only discoveries', async () => {
  const candidate = reconciliationCandidate();
  const prepared = prepareReconciliationCandidates([candidate], [{ domain: 'example.com' }]);
  assert.equal(prepared.length, 1);
  assert.deepEqual(Object.keys(prepared[0]).sort(), [
    'id',
    'publishedAt',
    'snippet',
    'source',
    'title',
    'url',
  ]);

  const result = await runProductionIngest({
    reconciliationCandidates: [candidate],
    reconciliationRevision: 'a'.repeat(40),
    now: '2026-07-19T00:00:00.000Z',
  }, { runId: 'reconciliation-test' }, {
    readState: async () => ({ publishedIds: [], dayPlans: {}, runHistory: [] }),
    readLatest: async () => [],
    readArchive: async () => [],
    loadRegistry: async () => [{ domain: 'example.com' }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.fetchedLive, false);
  assert.equal(result.value.reconciliation.revision, 'a'.repeat(40));
  assert.deepEqual(result.value.reconciliation.allowedDomains, ['example.com']);
  assert.deepEqual(result.value.picked, prepared);
  assert.equal(JSON.stringify(result.value.picked).includes('Legacy generated body'), false);
  assert.deepEqual(result.transitions.map(({ reason }) => reason.code), ['upstream_source_reconciliation']);
});

test('reconciliation ingest fails closed for unsafe, unregistered, or oversized batches', () => {
  assert.throws(
    () => prepareReconciliationCandidates([
      reconciliationCandidate({ url: 'https://127.0.0.1/private' }),
    ], [{ domain: 'example.com' }]),
    /canonical source discovery fields/,
  );
  assert.throws(
    () => prepareReconciliationCandidates([
      reconciliationCandidate({ url: 'https://unknown.example/story' }),
    ], [{ domain: 'example.com' }]),
    /rejected 1 source discovery row/,
  );
  assert.throws(
    () => prepareReconciliationCandidates(
      Array.from({ length: 31 }, (_, index) => reconciliationCandidate({
        url: `https://example.com/story-${index}`,
      })),
      [{ domain: 'example.com' }],
    ),
    /at most 30/,
  );
  assert.throws(
    () => prepareReconciliationCandidates([{
      ...reconciliationCandidate(),
      articleText: 'Generated projection data is not source discovery.',
    }], [{ domain: 'example.com' }]),
    /canonical source discovery fields/,
  );
});

test('reconciliation extraction fails closed when every source fetch fails', () => {
  assert.doesNotThrow(() => assertReconciliationExtractionProgress({}, []));
  assert.doesNotThrow(() => assertReconciliationExtractionProgress({
    reconciliation: { candidateCount: 2 },
  }, [{ id: 'extracted-one' }]));

  assert.throws(
    () => assertReconciliationExtractionProgress({
      reconciliation: { candidateCount: 27 },
    }, []),
    (error) => {
      assert.equal(error.code, 'reconciliation_extraction_empty');
      assert.match(error.message, /extracted 0 of 27 candidates/);
      return true;
    },
  );
});

test('reconciliation classification fails closed when no source passes extraction QA', () => {
  assert.doesNotThrow(() => assertReconciliationClassificationProgress({}, []));
  assert.doesNotThrow(() => assertReconciliationClassificationProgress({
    reconciliation: { candidateCount: 2 },
  }, [{ id: 'clean-one' }]));

  assert.throws(
    () => assertReconciliationClassificationProgress({
      reconciliation: { candidateCount: 27 },
    }, []),
    (error) => {
      assert.equal(error.code, 'reconciliation_classification_empty');
      assert.match(error.message, /0 of 27 candidates passed source extraction QA/);
      return true;
    },
  );
});

test('classify uses the canonical fail-closed public extraction boundary', async () => {
  const clean = extractedArticle({ id: 'clean', length: 700 });
  const thin = extractedArticle({ id: 'thin', length: 220 });
  const result = await runProductionClassify({ extracted: [clean, thin] });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.cleanSources.map(({ id }) => id), ['clean']);
  assert.deepEqual(result.value.classificationRejected.map(({ id }) => id), ['thin']);
  assert.match(result.value.classificationRejected[0].extractionBlockReasons.join(' '), /below_500/);
  assert.deepEqual(
    result.transitions.map(({ articleId, toState }) => [articleId, toState]),
    [['clean', 'clean_source'], ['thin', 'extraction_failed']],
  );
});

test('cluster downgrades clean but insufficient evidence to a source signal', async () => {
  const article = {
    ...extractedArticle({ id: 'source-only', length: 700 }),
    infrastructure_relevance: {
      infrastructure_relevance_score: 0.91,
      infrastructure_relevance_tier: 'full_memo',
      infrastructure_relevance_action: 'generate_full_memo',
      infrastructure_relevance_reasons: ['power_grid_relevance:0.91'],
    },
  };
  const result = await runProductionCluster({ cleanSources: [article] });

  assert.equal(result.value.editorialCandidates.length, 0);
  assert.deepEqual(result.value.signalCards.map(({ id }) => id), ['source-only']);
  assert.equal(result.value.signalCards[0].signalCardReason, 'source_evidence_insufficient_for_longform');
  assert.deepEqual(result.transitions.map(({ toState }) => toState), ['source_signal']);
});

test('reconciliation generation rejects provider fallback and records successful Image2 work', async () => {
  const signal = { ...extractedArticle({ id: 'signal-image2', length: 700 }), signalCardOnly: true };
  const fallback = async () => ({
    heroImage: '/generated/fallback.webp',
    thumbnailImage: '/generated/fallback-thumb.webp',
    ogImage: '/generated/fallback-og.webp',
    legacyImage: '/generated/fallback-legacy.webp',
    provider: 'local-placeholder',
    status: 'fallback',
  });
  await assert.rejects(
    () => runProductionGenerate({
      reconciliation: { candidateCount: 1 },
      signalCards: [signal],
    }, {}, { ensureImage: fallback }),
    (error) => error.code === 'reconciliation_image2_required',
  );

  const image2Paths = canonicalArticleImagePaths(signal, {
    extension: 'webp',
    legacyExtension: 'webp',
  });
  const image2 = async () => ({
    ...image2Paths,
    provider: 'image2',
    model: 'gpt-image-2',
    status: 'generated',
  });
  const result = await runProductionGenerate({
    reconciliation: { candidateCount: 1 },
    signalCards: [signal],
  }, {}, { ensureImage: image2 });

  assert.equal(result.value.signalCards[0].imageProvider, 'image2');
  assert.deepEqual(result.value.reconciliationProviders, {
    editorialRequired: 0,
    editorialSucceeded: 0,
    image2Required: 1,
    image2Succeeded: 1,
  });
  assert.doesNotThrow(() => assertReconciliationProviderCompletion(
    result.value,
    result.value.signalCards,
  ));
});

test('reconciliation editorial Image2 paths follow the final generated headline', async () => {
  const article = extractedArticle({ id: 'final-headline-image2', length: 1_300 });
  article.evidence_pack = buildSourceEvidencePack(article);
  const finalHeadline = 'Grid delivery changes the capacity timeline';
  let imageInput;

  const result = await runProductionGenerate({
    reconciliation: { candidateCount: 1 },
    editorialCandidates: [article],
  }, {}, {
    generateMetadata: async (input) => ({ ok: true, article: input }),
    attachLens: async ([input]) => [{
      ...input,
      expertLensFull: {
        finalHeadline,
        finalArticleBody: 'A source-grounded infrastructure analysis.',
      },
    }],
    ensureImage: async (input) => {
      imageInput = input;
      return {
        ...canonicalArticleImagePaths(input, {
          extension: 'webp',
          legacyExtension: 'webp',
        }),
        provider: 'image2',
        model: 'gpt-image-2',
        status: 'generated',
      };
    },
  });

  assert.notEqual(article.title, finalHeadline);
  assert.equal(imageInput.expertLensFull.finalHeadline, finalHeadline);
  assert.equal(result.value.generatedDrafts[0].expertLensFull.finalHeadline, finalHeadline);
  assert.doesNotThrow(() => assertReconciliationProviderCompletion(
    result.value,
    result.value.generatedDrafts,
  ));
});

test('reconciliation publication rejects missing provider completion evidence', () => {
  assert.doesNotThrow(() => assertReconciliationProviderCompletion({}, []));
  assert.throws(
    () => assertReconciliationProviderCompletion({
      reconciliation: { candidateCount: 1 },
      reconciliationProviders: {
        editorialRequired: 0,
        editorialSucceeded: 0,
        image2Required: 1,
        image2Succeeded: 0,
      },
    }, [{ id: 'fallback', imageProvider: 'local-placeholder' }]),
    (error) => error.code === 'reconciliation_provider_completion_invalid',
  );
  const repeatedPath = '/generated/articles/repeated/hero.webp';
  assert.throws(
    () => assertReconciliationProviderCompletion({
      reconciliation: { candidateCount: 1 },
      reconciliationProviders: {
        editorialRequired: 0,
        editorialSucceeded: 0,
        image2Required: 1,
        image2Succeeded: 1,
      },
    }, [{
      id: 'repeated',
      imageProvider: 'image2',
      imageStatus: 'generated',
      heroImage: repeatedPath,
      thumbnailImage: repeatedPath,
      ogImage: repeatedPath,
      legacyImage: repeatedPath,
    }]),
    (error) => error.code === 'reconciliation_provider_completion_invalid',
  );
  const shared = {
    id: 'shared-image2',
    title: 'Shared Image2 article',
    imageProvider: 'image2',
    imageStatus: 'generated',
  };
  Object.assign(shared, canonicalArticleImagePaths(shared, {
    extension: 'webp',
    legacyExtension: 'webp',
  }));
  assert.throws(
    () => assertReconciliationProviderCompletion({
      reconciliation: { candidateCount: 1 },
      reconciliationProviders: {
        editorialRequired: 0,
        editorialSucceeded: 0,
        image2Required: 1,
        image2Succeeded: 1,
      },
    }, [shared, { ...shared }]),
    (error) => error.code === 'reconciliation_provider_completion_invalid',
  );
});

test('reconciliation publish rejects fallback evidence before state or receipt access', async () => {
  let stateAccesses = 0;
  const unexpectedAccess = async () => {
    stateAccesses += 1;
    return { publicationReceipts: {} };
  };

  await assert.rejects(
    () => runProductionPublish({
      reconciliation: { candidateCount: 1 },
      reconciliationProviders: {
        editorialRequired: 0,
        editorialSucceeded: 0,
        image2Required: 1,
        image2Succeeded: 0,
      },
      signalCards: [{
        id: 'fallback-signal',
        imageProvider: 'local-placeholder',
        imageStatus: 'fallback',
      }],
    }, {
      runId: 'reconciliation-provider-failure',
      pipelineVersion: '5.6.2-test',
    }, {
      readState: unexpectedAccess,
      receiptStore: { load: unexpectedAccess },
    }),
    (error) => error.code === 'reconciliation_provider_completion_invalid',
  );

  assert.equal(stateAccesses, 0);
});

test('reconciliation publish preserves validated Image2 output and bundles all four variants', async (t) => {
  const signal = {
    id: `strict-image2-signal-${process.pid}-${Date.now()}`,
    title: 'Strict Image2 signal',
    publishedAt: '2026-07-19T00:00:00.000Z',
    imageProvider: 'image2',
    imageStatus: 'generated',
  };
  Object.assign(signal, await writeGeneratedImageFixtures(t, signal));
  const events = [];
  let capturedPaths = [];
  const result = await runProductionPublish({
    reconciliation: { candidateCount: 1 },
    reconciliationProviders: {
      editorialRequired: 0,
      editorialSucceeded: 0,
      image2Required: 1,
      image2Succeeded: 1,
    },
    signalCards: [signal],
  }, {
    runId: 'reconciliation-image2-bundle',
    pipelineVersion: '5.6.2-test',
  }, {
    readState: async () => {
      events.push('read-state');
      return { publishedIds: [], dayPlans: {}, runHistory: [], publicationReceipts: {} };
    },
    writeState: async () => {},
    writeJson: async () => {},
    publicDecision: () => ({ homepage: true, archive: true }),
    backfillImages: async () => {
      throw new Error('validated reconciliation images must not enter fallback backfill');
    },
    syncArchive: async (articles) => ({ latest: articles, archive: [], supabaseStatus: 'skipped' }),
    buildTaxonomy: () => ({ categories: [], companies: [], regions: [], archive: [] }),
    outputBundleStore: {
      capture: async (runId, paths) => {
        capturedPaths = paths;
        return outputManifest(runId);
      },
    },
  });

  assert.deepEqual(events, ['read-state']);
  assert.deepEqual(capturedPaths.slice(-4), [
    `public${signal.heroImage}`,
    `public${signal.thumbnailImage}`,
    `public${signal.ogImage}`,
    `public${signal.legacyImage}`,
  ]);
  assert.equal(result.value.publication.outputManifest.runId, 'reconciliation-image2-bundle');
});

test('reconciliation rejects another article image set before state access', async (t) => {
  const owner = {
    id: `image2-owner-${process.pid}-${Date.now()}`,
    title: 'Owner article',
  };
  const ownerPaths = await writeGeneratedImageFixtures(t, owner);
  let stateAccesses = 0;
  const unexpectedAccess = async () => {
    stateAccesses += 1;
    throw new Error('state must remain untouched');
  };

  await assert.rejects(
    () => runProductionPublish({
      reconciliation: { candidateCount: 1 },
      reconciliationProviders: {
        editorialRequired: 0,
        editorialSucceeded: 0,
        image2Required: 1,
        image2Succeeded: 1,
      },
      signalCards: [{
        id: `image2-borrower-${process.pid}-${Date.now()}`,
        title: 'Borrower article',
        imageProvider: 'image2',
        imageStatus: 'generated',
        ...ownerPaths,
      }],
    }, {
      runId: 'reconciliation-borrowed-image2',
      pipelineVersion: '5.6.2-test',
    }, {
      readState: unexpectedAccess,
      receiptStore: { load: unexpectedAccess },
    }),
    (error) => error.code === 'reconciliation_provider_completion_invalid',
  );

  assert.equal(stateAccesses, 0);
});

test('review downgrade removes an unapproved draft from the public read-model payload', async () => {
  const failed = {
    ...extractedArticle({ id: 'failed-draft', length: 1_300 }),
    summary: 'Unreviewed generated summary.',
    insight: 'Unreviewed generated implication.',
    expertLensShort: 'Unreviewed generated lens.',
    expertLensFull: { finalArticleBody: 'Unsupported draft body.' },
    signalCardReason: 'editorial_service_unavailable',
  };
  const result = await runProductionReview({ generationFailed: [failed] });
  const signal = result.value.finalSignalCards[0];

  assert.equal(signal.articlePagePublished, false);
  assert.equal(signal.summary, failed.snippet);
  assert.equal(signal.insight, '');
  assert.equal(signal.expertLensShort, '');
  assert.equal(signal.expertLensFull, null);
  assert.deepEqual(result.transitions.map(({ toState }) => toState), ['review_failed', 'source_signal']);
});

test('review reuses generation evidence and persists every public eligibility gate', async () => {
  const article = repairPublicLongformRecord(curatedLongformInput());
  const generatedBody = article.expertLensFull.finalArticleBody
    .replace('What 430 MW Has To Support', 'Capacity Conditions')
    .replace('The Mid-2027 Delivery Test', 'Delivery Schedule');
  article.articleText = generatedBody;
  article.cleaned_source_text = generatedBody;
  article.extraction_quality_score = 0.94;
  article.extraction_qa = { extraction_quality_score: 0.94 };
  article.infrastructure_relevance_score = 0.94;
  const evidencePack = buildSourceEvidencePack(article);
  const sourceFact = evidencePack.facts[3];
  article.summary = sourceFact;
  article.deck = sourceFact;
  article.why_it_matters = sourceFact;
  article.snippet = sourceFact;
  article.expertLensFull = {
    ...article.expertLensFull,
    finalArticleBody: generatedBody,
    metaDescription: sourceFact,
  };
  article.public_presentation = {
    ...article.public_presentation,
    deck: sourceFact,
    why_it_matters: sourceFact,
  };
  article.evidence_pack = evidencePack;
  for (const field of ['source_fidelity', 'claim_fidelity', 'seo_fidelity']) delete article[field];

  const result = await runProductionReview({
    generatedDrafts: [article],
    existingLatest: [],
    existingArchive: [],
  });
  const reviewed = result.value.reviewPassed[0];

  assert.ok(reviewed);
  assert.equal(reviewed.source_fidelity.ok, true);
  assert.equal(reviewed.claim_fidelity.ok, true);
  assert.deepEqual(reviewed.claim_fidelity.unsupportedClaims, []);
  assert.equal(reviewed.seo_fidelity.ok, true);
  assert.equal(publicSurfaceDecision(reviewed).detailPage, true);
  assert.deepEqual(result.transitions.map(({ toState }) => toState), ['publish_ready']);

  const ineligible = {
    ...reviewed,
    public_content_tier: 'source_signal',
    public_status: 'draft',
    draft: true,
    signalCardOnly: true,
    articlePagePublished: false,
    homepagePublished: false,
  };
  const directReview = reviewGeneratedCandidate(ineligible, []);
  assert.equal(directReview.ok, false);
  assert.equal(directReview.code, 'public_longform_ineligible');
  assert.equal(directReview.article.public_eligibility.detailPage, false);
});

test('generated summary cannot enter extraction evidence or self-validate unsupported claims', async () => {
  const article = extractedArticle({ id: 'circular-evidence', length: 1_300 });
  article.summary = 'The company guaranteed 999 GW of capacity on Mars.';
  const evidencePack = buildSourceEvidencePack(article);
  assert.doesNotMatch(evidencePack.evidenceText, /999 GW|Mars/i);
  assert.doesNotMatch(evidencePack.facts.join(' '), /999 GW|Mars/i);
  for (const fact of evidencePack.facts) {
    assert.ok(
      evidencePack.evidenceText.toLowerCase().includes(fact.toLowerCase()),
      `extraction fact must be an exact source sentence: ${fact}`,
    );
  }

  const result = await runProductionReview({
    generatedDrafts: [{
      ...article,
      evidence_pack: evidencePack,
      expertLensFull: {
        finalArticleBody: 'The company guaranteed 999 GW of capacity on Mars.',
        metaDescription: 'The company guaranteed 999 GW of capacity on Mars.',
      },
    }],
  });
  assert.equal(result.value.reviewPassed.length, 0);
  assert.equal(result.value.reviewFailed.length, 1);
  assert.match(result.value.reviewFailed[0].signalCardReason, /source_fidelity_failed/);
});

test('extraction evidence does not invent a default source title', () => {
  const article = extractedArticle({ id: 'missing-title', length: 1_300 });
  delete article.title;
  const evidencePack = buildSourceEvidencePack(article);

  assert.doesNotMatch(evidencePack.evidenceText, /Untitled item/i);
  assert.doesNotMatch(evidencePack.facts.join(' '), /Untitled item/i);
});

test('generate fails the phase on unexpected implementation errors instead of masking them', async () => {
  const source = extractedArticle({ id: 'broken-generator', length: 1_300 });
  const broken = { ...source };
  Object.defineProperty(broken, 'evidence_pack', {
    get() { throw new TypeError('unexpected evidence access failure'); },
  });

  await assert.rejects(
    () => runProductionGenerate({ editorialCandidates: [broken] }),
    (error) => error instanceof TypeError && /unexpected evidence access failure/.test(error.message),
  );
});

test('editorial-only generation can skip image writes while preserving canonical draft generation', async () => {
  const source = extractedArticle({ id: 'editorial-only', length: 1_300 });
  source.evidence_pack = buildSourceEvidencePack(source);
  let imageCalls = 0;
  let draftInput;
  const result = await generateCandidate(source, [], {
    generateImage: false,
    generateMetadata: async (article) => ({ ok: true, article }),
    ensureImage: async () => {
      imageCalls += 1;
      throw new Error('image generation must be skipped');
    },
    attachLens: async ([article]) => {
      draftInput = article;
      return [{ ...article, expertLensFull: { finalArticleBody: 'Editorial-only draft.' } }];
    },
  });

  assert.equal(imageCalls, 0);
  assert.equal(draftInput.id, source.id);
  assert.equal(result.expertLensFull.finalArticleBody, 'Editorial-only draft.');
});

test('publish accounting marks extraction and classification rejects as processed blockers', () => {
  const extractionFailed = [{ id: 'extract-failed', extractionFailureCode: 'source_extraction_failed' }];
  const classificationRejected = [{ id: 'classify-failed', qualityGateReason: 'source_extraction_fail_closed' }];
  const accounting = buildProductionPublishAccounting({ extractionFailed, classificationRejected });

  assert.deepEqual(accounting.publicUpdates, []);
  assert.deepEqual(accounting.processedItems.map(({ id }) => id), ['extract-failed', 'classify-failed']);
  assert.deepEqual(accounting.blockedItems.map(({ id }) => id), ['extract-failed', 'classify-failed']);
});

test('publish removes stale public longform when the same source now fails extraction', async () => {
  const stale = {
    id: 'stale-longform',
    title: 'Stale longform',
    publishedAt: '2026-07-11T00:00:00.000Z',
    articlePagePublished: true,
    homepagePublished: true,
  };
  const state = { publishedIds: [], dayPlans: {}, runHistory: [], publicationReceipts: {} };
  let archiveInput;
  let latestOutput;
  await runProductionPublish({
    now: '2026-07-12T00:00:00.000Z',
    existingLatest: [stale],
    existingArchive: [stale],
    extractionFailed: [{ ...stale, extractionFailureCode: 'source_extraction_failed' }],
  }, {
    runId: 'cycle-stale-removal',
    pipelineVersion: '5.6.0-test',
  }, {
    readState: async () => state,
    writeState: async () => {},
    backfillImages: async (articles) => articles,
    syncArchive: async (articles, priorArchive) => {
      archiveInput = priorArchive;
      return { latest: articles, supabaseStatus: 'skipped' };
    },
    writeJson: async (filePath, value) => {
      if (filePath.endsWith('latest-news.json')) latestOutput = value;
    },
  });

  assert.deepEqual(archiveInput, []);
  assert.deepEqual(latestOutput, []);
  assert.deepEqual(state.publishedIds, ['stale-longform']);
});

test('production publish deduplicates only public canonical sources and preserves semantic URLs', async () => {
  const state = { publishedIds: [], dayPlans: {}, runHistory: [], publicationReceipts: {} };
  const current = {
    id: 'current-source',
    title: 'Current source record',
    sourceUrl: 'https://example.com/report/Grid?id=1&utm_source=feed',
    publishedAt: '2026-07-18T00:00:00.000Z',
  };
  const staleDuplicate = {
    ...current,
    id: 'stale-source',
    sourceUrl: 'https://example.com/report/Grid?id=1#details',
    publishedAt: '2026-07-17T00:00:00.000Z',
  };
  const semanticQuery = {
    ...current,
    id: 'semantic-query',
    sourceUrl: 'https://example.com/report/Grid?id=2',
  };
  const caseSensitivePath = {
    ...current,
    id: 'case-sensitive-path',
    sourceUrl: 'https://example.com/report/grid?id=1',
  };
  const hiddenHistorical = {
    ...staleDuplicate,
    id: 'hidden-historical',
    archiveOnly: true,
  };
  let publishedIds = [];

  await runProductionPublish({
    reviewPassed: [current, semanticQuery, caseSensitivePath],
    existingLatest: [staleDuplicate],
    existingArchive: [hiddenHistorical],
  }, {
    runId: 'cycle-canonical-source-dedupe',
    pipelineVersion: '5.6.1-test',
  }, {
    readState: async () => state,
    writeState: async () => {},
    writeJson: async () => {},
    publicDecision: (article) => ({
      archive: article.archiveOnly !== true,
      homepage: article.archiveOnly !== true,
    }),
    backfillImages: async (articles) => {
      publishedIds = articles.map((article) => article.id);
      return articles;
    },
    syncArchive: async (articles) => ({ latest: articles, archive: [], supabaseStatus: 'skipped' }),
  });

  assert.deepEqual(new Set(publishedIds), new Set([
    'current-source',
    'semantic-query',
    'case-sensitive-path',
    'hidden-historical',
  ]));
  assert.equal(publishedIds.includes('stale-source'), false);
});

test('real archive synchronizer cannot reintroduce a stale public canonical source', async () => {
  const current = {
    id: 'canonical-newer',
    title: 'Current canonical record',
    sourceUrl: 'https://example.com/report/Grid?id=1&utm_source=feed',
    publishedAt: '2026-07-18T00:00:00.000Z',
  };
  const stale = {
    ...current,
    id: 'canonical-stale-archive',
    sourceUrl: 'https://example.com/report/Grid?id=1#details',
    publishedAt: '2026-07-17T00:00:00.000Z',
  };
  const semanticQuery = {
    ...current,
    id: 'semantic-query-archive',
    sourceUrl: 'https://example.com/report/Grid?id=2',
  };
  const hiddenHistory = {
    ...stale,
    id: 'hidden-history',
    archiveOnly: true,
  };
  const writes = new Map();

  const result = await syncArchiveArtifacts(
    [current, semanticQuery],
    [stale, hiddenHistory],
    {
      publicDecision: (article) => ({
        archive: article.archiveOnly !== true,
        homepage: article.archiveOnly !== true,
      }),
      upsertArchive: async () => ({ pushed: false, reason: 'test' }),
      writeJson: async (filePath, value) => writes.set(filePath, value),
    },
  );

  assert.deepEqual(result.latest.map((article) => article.id), ['canonical-newer', 'semantic-query-archive']);
  assert.deepEqual(result.archive.map((article) => article.id), ['hidden-history']);
  assert.equal(writes.get('src/data/search-index.json').some((article) => article.id === 'canonical-stale-archive'), false);
  assert.equal(writes.get('src/data/search-index.json').some((article) => article.id === 'hidden-history'), true);
});

test('publication receipts retain retry attempts and a stable completion result', () => {
  const state = {};
  beginProductionPublication(state, {
    runId: 'cycle-1',
    pipelineVersion: '5.6.0-test',
    startedAt: '2026-07-12T00:00:00.000Z',
  });
  beginProductionPublication(state, {
    runId: 'cycle-1',
    pipelineVersion: '5.6.0-test',
    startedAt: '2026-07-12T00:01:00.000Z',
  });
  completeProductionPublication(state, {
    runId: 'cycle-1',
    completedAt: '2026-07-12T00:02:00.000Z',
    result: { latestCount: 12, publishedCount: 1 },
  });

  assert.deepEqual(productionPublicationReceipt(state, 'cycle-1'), {
    runId: 'cycle-1',
    pipelineVersion: '5.6.0-test',
    status: 'completed',
    startedAt: '2026-07-12T00:00:00.000Z',
    attempts: 2,
    completedAt: '2026-07-12T00:02:00.000Z',
    result: { latestCount: 12, publishedCount: 1 },
  });
});

test('publish replay uses its completion receipt without repeating public writes', async () => {
  const publication = {
    latestCount: 12,
    publishedCount: 1,
    signalCardCount: 0,
    archiveOnlyCount: 0,
    supabaseStatus: 'synced',
    outputManifest: outputManifest('cycle-replay'),
  };
  const state = {
    publicationReceipts: {
      'cycle-replay': {
        runId: 'cycle-replay',
        pipelineVersion: '5.6.0-test',
        status: 'completed',
        result: publication,
      },
    },
  };
  const unexpected = async () => { throw new Error('public write must not repeat'); };
  const result = await runProductionPublish({
    reviewPassed: [{ id: 'published-article' }],
  }, {
    runId: 'cycle-replay',
    pipelineVersion: '5.6.0-test',
  }, {
    readState: async () => state,
    writeState: unexpected,
    writeJson: unexpected,
    syncArchive: unexpected,
    backfillImages: unexpected,
  });

  assert.deepEqual(result.value.publication, publication);
  assert.deepEqual(result.transitions.map(({ toState }) => toState), ['published']);
});

test('publish stops before public writes when execution ownership is lost mid-provider', async () => {
  let ownershipValid = true;
  let publicWrites = 0;
  const durableState = { publicationReceipts: {} };

  await assert.rejects(
    () => runProductionPublish({}, {
      runId: 'cycle-fenced-publish',
      pipelineVersion: '5.6.0-test',
      executionIdentity: {
        kind: 'upstream-reconciliation',
        revision: 'a'.repeat(40),
        fingerprint: 'b'.repeat(64),
      },
      assertExecutionOwnership: async () => {
        if (!ownershipValid) {
          throw Object.assign(new Error('content cycle lease ownership was lost'), {
            code: 'checkpoint_lease_lost',
          });
        }
      },
    }, {
      receiptStore: {
        load: async () => durableState,
        save: async () => { ownershipValid = false; },
      },
      readState: async () => ({ publicationReceipts: {} }),
      writeState: async () => { publicWrites += 1; },
      writeJson: async () => { publicWrites += 1; },
      syncArchive: async () => { publicWrites += 1; },
      backfillImages: async () => { publicWrites += 1; },
    }),
    /lease ownership was lost/,
  );

  assert.equal(publicWrites, 0);
});

test('publish reconciles durable completion after a fresh runner without repeating public writes', async () => {
  const publication = {
    latestCount: 12,
    publishedCount: 1,
    signalCardCount: 0,
    archiveOnlyCount: 0,
    supabaseStatus: 'synced',
    outputManifest: outputManifest('cycle-durable-replay'),
  };
  const state = { publishedIds: [], dayPlans: {}, runHistory: [], publicationReceipts: {} };
  const durableState = {
    publicationReceipts: {
      'cycle-durable-replay': {
        runId: 'cycle-durable-replay',
        pipelineVersion: '5.6.0-test',
        status: 'completed',
        startedAt: '2026-07-12T00:00:00.000Z',
        attempts: 1,
        completedAt: '2026-07-12T00:01:00.000Z',
        result: publication,
      },
    },
  };
  const unexpected = async () => { throw new Error('public write must not repeat'); };
  let persistedState;
  const result = await runProductionPublish({
    now: '2026-07-12T00:02:00.000Z',
    reviewPassed: [{ id: 'published-article' }],
  }, {
    runId: 'cycle-durable-replay',
    pipelineVersion: '5.6.0-test',
  }, {
    receiptStore: {
      load: async () => durableState,
      save: unexpected,
    },
    readState: async () => state,
    writeState: async (_path, nextState) => { persistedState = structuredClone(nextState); },
    writeJson: unexpected,
    syncArchive: unexpected,
    backfillImages: unexpected,
  });

  assert.deepEqual(result.value.publication, publication);
  assert.equal(persistedState.publicationReceipts['cycle-durable-replay'].status, 'completed');
  assert.deepEqual(persistedState.publishedIds, ['published-article']);
  assert.deepEqual(persistedState.runHistory.map(({ runId }) => runId), ['cycle-durable-replay']);
});

test('publish replay rejects stale pipeline receipts before any public write', async () => {
  const unexpected = async () => { throw new Error('public write must not run'); };
  await assert.rejects(
    () => runProductionPublish({}, {
      runId: 'cycle-stale-receipt',
      pipelineVersion: '5.6.1-test',
    }, {
      receiptStore: {
        load: async () => ({
          publicationReceipts: {
            'cycle-stale-receipt': {
              runId: 'cycle-stale-receipt',
              pipelineVersion: '5.6.0-test',
              status: 'completed',
              startedAt: '2026-07-12T00:00:00.000Z',
              attempts: 1,
              completedAt: '2026-07-12T00:01:00.000Z',
              result: {
                publishedCount: 99,
                outputManifest: outputManifest('cycle-stale-receipt'),
              },
            },
          },
        }),
        save: unexpected,
      },
      readState: async () => ({ publicationReceipts: {} }),
      writeState: unexpected,
      writeJson: unexpected,
      syncArchive: unexpected,
      backfillImages: unexpected,
    }),
    /does not match the active content cycle/,
  );
});

test('publish replay rejects completed receipts without a matching output manifest', async () => {
  const unexpected = async () => { throw new Error('public write must not run'); };
  await assert.rejects(
    () => runProductionPublish({}, {
      runId: 'cycle-missing-manifest',
      pipelineVersion: '5.6.1-test',
    }, {
      receiptStore: {
        load: async () => ({
          publicationReceipts: {
            'cycle-missing-manifest': {
              runId: 'cycle-missing-manifest',
              pipelineVersion: '5.6.1-test',
              status: 'completed',
              startedAt: '2026-07-12T00:00:00.000Z',
              attempts: 1,
              completedAt: '2026-07-12T00:01:00.000Z',
              result: { publishedCount: 1 },
            },
          },
        }),
        save: unexpected,
      },
      readState: async () => ({ publicationReceipts: {} }),
      writeState: unexpected,
      writeJson: unexpected,
      syncArchive: unexpected,
      backfillImages: unexpected,
    }),
    /does not match the active content cycle/,
  );
});

test('publish persists a preparing receipt before any public read-model side effect', async () => {
  const state = { publishedIds: [], dayPlans: {}, runHistory: [], publicationReceipts: {} };
  const events = [];
  await runProductionPublish({}, {
    runId: 'cycle-ordering',
    pipelineVersion: '5.6.0-test',
  }, {
    receiptStore: {
      load: async () => ({ publicationReceipts: {} }),
      save: async (nextState) => {
        events.push(`receipt:${nextState.publicationReceipts['cycle-ordering'].status}`);
      },
    },
    readState: async () => state,
    writeState: async (_path, nextState) => {
      events.push(`state:${nextState.publicationReceipts['cycle-ordering'].status}`);
    },
    backfillImages: async (articles) => {
      events.push('images');
      return articles;
    },
    syncArchive: async (articles) => {
      events.push('archive');
      return { latest: articles, supabaseStatus: 'skipped' };
    },
    writeJson: async (filePath) => {
      events.push(filePath.endsWith('taxonomy-pages.json') ? 'taxonomy' : 'json');
    },
  });

  assert.deepEqual(events, [
    'receipt:preparing',
    'state:preparing',
    'images',
    'archive',
    'json',
    'taxonomy',
    'state:completed',
    'receipt:completed',
  ]);
});

test('publish rebuilds taxonomy from the same latest and archive generation', async () => {
  const state = { publishedIds: [], dayPlans: {}, runHistory: [], publicationReceipts: {} };
  const written = new Map();
  let taxonomyInputIds = [];
  await runProductionPublish({
    reviewPassed: [{ id: 'new-public-item', title: 'New public item', publishedAt: '2026-07-14T00:00:00.000Z' }],
  }, {
    runId: 'cycle-taxonomy-projection',
    pipelineVersion: '5.6.1-test',
  }, {
    readState: async () => state,
    writeState: async () => {},
    backfillImages: async (articles) => articles,
    syncArchive: async (articles) => ({
      latest: articles,
      archive: [{ id: 'prior-archive', title: 'Prior archive' }],
      supabaseStatus: 'skipped',
    }),
    buildTaxonomy: (articles) => {
      taxonomyInputIds = articles.map((article) => article.id);
      return { categories: [], companies: [], regions: [], archive: [] };
    },
    writeJson: async (filePath, value) => written.set(filePath, value),
  });

  assert.deepEqual(taxonomyInputIds, ['new-public-item', 'prior-archive']);
  assert.deepEqual(written.get('src/data/taxonomy-pages.json'), {
    categories: [], companies: [], regions: [], archive: [],
  });
});

test('publish bundles every refreshed image variant without copying unchanged inventory', async () => {
  const state = { publishedIds: [], dayPlans: {}, runHistory: [], publicationReceipts: {} };
  const durableState = { publicationReceipts: {} };
  let capturedPaths;
  const result = await runProductionPublish({
    reviewPassed: [{ id: 'fresh-image', title: 'Fresh image', publishedAt: '2026-07-12T00:00:00.000Z' }],
  }, {
    runId: 'cycle-image-bundle',
    pipelineVersion: '5.6.1-test',
  }, {
    receiptStore: {
      load: async () => durableState,
      save: async () => {},
    },
    outputBundleStore: {
      capture: async (runId, paths) => {
        capturedPaths = paths;
        return { schemaVersion: 1, runId, files: [{ path: paths[0], sha256: 'a'.repeat(64), size: 1 }] };
      },
    },
    readState: async () => state,
    writeState: async () => {},
    writeJson: async () => {},
    backfillImages: async (articles, options) => {
      assert.equal(options.collectOutputs, true);
      return {
        articles,
        outputPaths: [
          '/generated/articles/fresh/hero.webp',
          '/generated/articles/fresh/thumbnail.webp',
          '/generated/articles/fresh/og.webp',
          '/generated/fresh.webp',
        ],
      };
    },
    syncArchive: async (articles) => ({ latest: articles, supabaseStatus: 'skipped' }),
  });

  assert.deepEqual(capturedPaths.slice(-4), [
    'public/generated/articles/fresh/hero.webp',
    'public/generated/articles/fresh/thumbnail.webp',
    'public/generated/articles/fresh/og.webp',
    'public/generated/fresh.webp',
  ]);
  assert.ok(capturedPaths.includes('src/data/taxonomy-pages.json'));
  assert.equal(result.value.publication.outputManifest.runId, 'cycle-image-bundle');
});
