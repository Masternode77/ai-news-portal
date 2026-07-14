import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { articleDetailQualityResult } from '../scripts/lib/article-detail-quality-gate.mjs';
import { generateLongformAnalysis, longformQualityResult } from '../scripts/lib/longform-engine.mjs';
import { isPublicLongformArticle, publicSurfaceDecision } from '../scripts/lib/public-surface-eligibility.mjs';
import {
  CURATED_ARTICLE_ID,
  applyPublicLongformInventoryPlan,
  planPublicLongformInventory,
  repairPublicLongformRecord,
  repairPublicLongformRecords,
  rollbackPublicLongformInventory,
} from '../scripts/repair-public-longform-inventory.mjs';

const STALE_METADATA_KEYS = [
  'articleBlueprint',
  'article_blueprint',
  'autonomous_quality',
  'blueprintId',
  'blueprintName',
  'editorial_thesis',
  'emergency_cleanup_audit',
  'narrative_dna',
  'previous_generation_version',
  'public_generation_version',
  'quarantine_reason',
  'regeneration_needed_reason',
  'stale_generation',
];

function assertNoStaleMetadata(article) {
  const serialized = JSON.stringify(article);
  for (const staleKey of STALE_METADATA_KEYS) {
    assert.doesNotMatch(serialized, new RegExp(`"${staleKey}"`), staleKey);
  }
}

function claimedLongform(id = 'legacy-thin') {
  const sourceText = 'A utility filing confirms a contracted campus, power allocation, construction schedule, and customer delivery date. '.repeat(12);
  return {
    id,
    title: 'A contracted campus still has to reach energization',
    source: 'Infrastructure Filing',
    sourceUrl: 'https://example.com/campus',
    publishedAt: '2026-04-23T00:00:00Z',
    public_content_tier: 'longform_analysis',
    public_status: 'published',
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    signalCardOnly: false,
    noindex: false,
    seo_noindex: false,
    extraction_quality_score: 0.95,
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
      editorial_thesis: 'stale nested thesis',
      narrative_dna: { blueprintId: 'stale-blueprint' },
    },
    contentText: sourceText,
    articleText: sourceText,
    expertLensFull: {
      finalArticleBody: 'A short body cannot support a public analysis page.',
    },
    public_routing: { visibility: 'core' },
  };
}

test('public longform eligibility fails closed on a thin claimed analysis', () => {
  assert.equal(isPublicLongformArticle(claimedLongform()), false);
});

test('inventory repair downgrades source-backed legacy longforms to source signals', () => {
  const repaired = repairPublicLongformRecord(claimedLongform());
  assert.equal(repaired.public_status, 'signal');
  assert.equal(repaired.articlePagePublished, false);
  assert.equal(repaired.homepagePublished, true);
  assert.equal(repaired.signalCardOnly, true);
  assert.equal(repaired.qualityGateBlocked, false);
  assert.equal(repaired.infrastructure_relevance_tier, 'signal_card');
  assert.equal(repaired.infrastructure_relevance_action, 'publish_signal_card_only');
  assert.equal(repaired.infrastructureRelevanceAction, 'publish_signal_card_only');
  assert.equal(repaired.infrastructure_relevance.infrastructure_relevance_action, 'publish_signal_card_only');
  assert.equal(repaired.infrastructure_relevance.infrastructureRelevanceAction, 'publish_signal_card_only');
  assert.equal(repaired.infrastructure_relevance.articlePagePublished, false);
  assert.equal(repaired.editorial_thesis, undefined);
  assert.equal(repaired.articleBlueprint, undefined);
  assert.equal(repaired.stale_generation, undefined);
  assert.match(repaired.localArticleQualityReasons.join(' '), /body_below_4500_chars/);
  assert.equal(repaired.public_presentation.view_detail, '');
  assert.equal(repaired.public_presentation.read_source, 'https://example.com/campus');
  assertNoStaleMetadata(repaired);
  assert.deepEqual(repairPublicLongformRecord(repaired), repaired);
});

test('inventory repair normalizes legacy signal cards with stale full-memo lifecycle metadata', () => {
  const legacy = claimedLongform('legacy-signal-lifecycle');
  legacy.public_status = undefined;
  legacy.public_content_tier = undefined;
  legacy.articlePagePublished = false;
  legacy.signalCardOnly = true;

  const normalized = repairPublicLongformRecord(legacy);
  assert.equal(normalized.public_status, 'signal');
  assert.equal(normalized.public_content_tier, 'signal_card');
  assert.equal(normalized.infrastructure_relevance_tier, 'signal_card');
  assert.equal(normalized.infrastructure_relevance_action, 'publish_signal_card_only');
  assert.equal(normalized.infrastructureRelevanceAction, 'publish_signal_card_only');
  assert.equal(normalized.infrastructure_relevance.infrastructure_relevance_tier, 'signal_card');
  assert.equal(normalized.infrastructure_relevance.articlePagePublished, false);
  assertNoStaleMetadata(normalized);
  assert.deepEqual(repairPublicLongformRecord(normalized), normalized);
});

test('inventory repair keeps archived records hidden while removing stale full-memo lifecycle metadata', () => {
  const legacy = claimedLongform('legacy-archive-lifecycle');
  legacy.public_status = 'archive_only_noindex';
  legacy.articlePagePublished = false;
  legacy.homepagePublished = false;
  legacy.archiveOnly = true;

  const normalized = repairPublicLongformRecord(legacy);
  assert.equal(normalized.public_status, 'archive_only_noindex');
  assert.equal(normalized.public_content_tier, 'hidden');
  assert.equal(normalized.infrastructure_relevance_tier, 'archive_only');
  assert.equal(normalized.infrastructure_relevance_action, 'archive_only');
  assert.equal(normalized.infrastructureRelevanceAction, 'archive_only');
  assert.equal(normalized.infrastructure_relevance.infrastructure_relevance_tier, 'archive_only');
  assert.equal(normalized.infrastructure_relevance.infrastructure_relevance_action, 'archive_only');
  assert.equal(normalized.infrastructure_relevance.articlePagePublished, false);
  assert.equal(normalized.infrastructure_relevance.archiveOnly, true);
  assertNoStaleMetadata(normalized);
  assert.deepEqual(repairPublicLongformRecord(normalized), normalized);
});

test('inventory repair also downgrades a structurally valid longform that fails the detail gate', () => {
  const articleText = 'A utility filing ties a contracted AI campus to substation delivery, transformer procurement, cooling completion, customer fit-out, financing, and a dated energization milestone. '.repeat(12);
  const claimed = generateLongformAnalysis({
    ...claimedLongform('legacy-adjacent'),
    articleText,
    rawText: articleText,
  });
  claimed.public_routing = { ...claimed.public_routing, visibility: 'adjacent' };
  assert.equal(longformQualityResult(claimed).ok, true);
  assert.equal(articleDetailQualityResult(claimed).ok, false);

  const repaired = repairPublicLongformRecord(claimed);

  assert.equal(repaired.public_status, 'signal');
  assert.equal(repaired.articlePagePublished, false);
  assert.match(repaired.localArticleQualityReasons.join(' '), /route_not_core:adjacent/);
});

test('inventory repair archives a failed longform when its source URL is unsafe', () => {
  const repaired = repairPublicLongformRecord({
    ...claimedLongform('unsafe-source'),
    sourceUrl: 'javascript:alert(1)',
    url: 'javascript:alert(1)',
  });
  assert.equal(repaired.public_status, 'archive_only_noindex');
  assert.equal(repaired.homepagePublished, false);
  assert.equal(repaired.qualityGateBlocked, true);
  assert.equal(repaired.public_content_tier, 'hidden');
  assert.equal(repaired.infrastructure_relevance_tier, 'archive_only');
  assert.equal(repaired.infrastructure_relevance_action, 'archive_only');
  assert.equal(repaired.infrastructure_relevance.infrastructure_relevance_tier, 'archive_only');
  assert.equal(repaired.infrastructure_relevance.articlePagePublished, false);
  assertNoStaleMetadata(repaired);
});

test('inventory repair installs one source-grounded analysis that passes both gates', () => {
  const repaired = repairPublicLongformRecord(claimedLongform(CURATED_ARTICLE_ID));
  assert.equal(longformQualityResult(repaired).ok, true);
  assert.equal(articleDetailQualityResult(repaired).ok, true);
  assert.equal(isPublicLongformArticle(repaired), true);
  assert.equal(repaired.source, 'Applied Digital');
  assert.match(repaired.expertLensFull.finalArticleBody, /mid-2027/);
  assert.equal(repaired.repetition_blocked, false);
  assert.equal(repaired.source_fidelity.ok, true);
  assert.equal(repaired.claim_fidelity.ok, true);
  assert.equal(repaired.seo_fidelity.ok, true);
  assert.equal(repaired.claim_fidelity.totalClaims > 30, true);
  assert.equal(repaired.claim_fidelity.unsupportedClaims.length, 0);
  assert.equal(repaired.public_copy_stale, undefined);
  assert.equal(repaired.stale_generation, undefined);
  assert.equal(repaired.routing_decision, 'core_longform_blog');
  assert.equal(repaired.blog_metadata.thesis, undefined);
  assertNoStaleMetadata(repaired);
});

test('public longform eligibility fails closed when a persisted fidelity result is missing', () => {
  const repaired = repairPublicLongformRecord(claimedLongform(CURATED_ARTICLE_ID));

  for (const field of ['source_fidelity', 'claim_fidelity', 'seo_fidelity']) {
    const incomplete = structuredClone(repaired);
    delete incomplete[field];
    const decision = publicSurfaceDecision(incomplete);
    assert.equal(decision.archive, false, field);
    assert.equal(decision.detailPage, false, field);
    assert.equal(decision.homepage, false, field);
    assert.equal(decision.rss, false, field);
  }
});

test('curated analysis is compared against recent public longforms for repetition', () => {
  const curated = repairPublicLongformRecord(claimedLongform(CURATED_ARTICLE_ID));
  assert.throws(() => repairPublicLongformRecords([
    claimedLongform(CURATED_ARTICLE_ID),
    { ...curated, id: 'recent-copy', publishedAt: '2026-07-10T00:00:00Z' },
  ]), /repeated_sentence_ratio/);
});

async function inventoryFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'public-longform-repair-'));
  const paths = {
    latest: path.join(dir, 'latest.json'),
    archived: path.join(dir, 'archived.json'),
    searchIndex: path.join(dir, 'search.json'),
  };
  const article = claimedLongform();
  await Promise.all([
    fs.writeFile(paths.latest, '[]\n'),
    fs.writeFile(paths.archived, `${JSON.stringify([article], null, 2)}\n`),
    fs.writeFile(paths.searchIndex, `${JSON.stringify([article], null, 2)}\n`),
  ]);
  return { dir, paths };
}

test('inventory migration is dry-run by default and rejects malformed input before writes', async () => {
  const fixture = await inventoryFixture();
  const before = await fs.readFile(fixture.paths.archived, 'utf8');
  const plan = await planPublicLongformInventory({ paths: fixture.paths });
  assert.ok(plan.changed.length > 0);
  assert.equal(await fs.readFile(fixture.paths.archived, 'utf8'), before);

  await fs.writeFile(fixture.paths.searchIndex, '{broken', 'utf8');
  await assert.rejects(planPublicLongformInventory({ paths: fixture.paths }), SyntaxError);
  assert.equal(await fs.readFile(fixture.paths.archived, 'utf8'), before);
});

test('inventory migration writes rollback snapshots and restores byte-identical inputs', async () => {
  const fixture = await inventoryFixture();
  const before = Object.fromEntries(await Promise.all(Object.entries(fixture.paths).map(async ([key, filePath]) => (
    [key, await fs.readFile(filePath, 'utf8')]
  ))));
  const plan = await planPublicLongformInventory({ paths: fixture.paths });
  const result = await applyPublicLongformInventoryPlan(plan, {
    artifactRoot: path.join(fixture.dir, 'artifacts'),
    timestamp: '2026-07-11T00:00:00.000Z',
  });
  assert.equal(result.applied, true);
  assert.equal(JSON.parse(await fs.readFile(fixture.paths.archived, 'utf8'))[0].public_status, 'signal');
  const secondPlan = await planPublicLongformInventory({ paths: fixture.paths });
  assert.equal(secondPlan.changed.length, 0);
  await rollbackPublicLongformInventory(result.manifestPath, { paths: fixture.paths });
  for (const [key, filePath] of Object.entries(fixture.paths)) {
    assert.equal(await fs.readFile(filePath, 'utf8'), before[key]);
  }
});

test('inventory migration restores every file when an apply write fails', async () => {
  const fixture = await inventoryFixture();
  const before = Object.fromEntries(await Promise.all(Object.entries(fixture.paths).map(async ([key, filePath]) => (
    [key, await fs.readFile(filePath, 'utf8')]
  ))));
  const plan = await planPublicLongformInventory({ paths: fixture.paths });
  let writes = 0;
  await assert.rejects(applyPublicLongformInventoryPlan(plan, {
    artifactRoot: path.join(fixture.dir, 'artifacts'),
    timestamp: '2026-07-11T00:00:00.000Z',
    atomicWrite: async (filePath, content) => {
      writes += 1;
      if (writes === 2) throw new Error('injected write failure');
      await fs.writeFile(filePath, content, 'utf8');
    },
  }), /injected write failure/);
  for (const [key, filePath] of Object.entries(fixture.paths)) {
    assert.equal(await fs.readFile(filePath, 'utf8'), before[key]);
  }
});

test('inventory migration refuses to overwrite data changed after planning', async () => {
  const fixture = await inventoryFixture();
  const plan = await planPublicLongformInventory({ paths: fixture.paths });
  await fs.writeFile(fixture.paths.latest, '[{"id":"concurrent"}]\n', 'utf8');
  await assert.rejects(applyPublicLongformInventoryPlan(plan, {
    artifactRoot: path.join(fixture.dir, 'artifacts'),
  }), /inventory changed after planning/);
  assert.equal(await fs.readFile(fixture.paths.latest, 'utf8'), '[{"id":"concurrent"}]\n');
});

test('inventory rollback rejects malformed snapshots and target substitution', async () => {
  const fixture = await inventoryFixture();
  const plan = await planPublicLongformInventory({ paths: fixture.paths });
  const result = await applyPublicLongformInventoryPlan(plan, {
    artifactRoot: path.join(fixture.dir, 'artifacts'),
    timestamp: '2026-07-11T00:00:00.000Z',
  });
  const manifest = JSON.parse(await fs.readFile(result.manifestPath, 'utf8'));
  manifest.files.latest.before = '../outside.json';
  await fs.writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await assert.rejects(
    rollbackPublicLongformInventory(result.manifestPath, { paths: fixture.paths }),
    /snapshot names do not match latest/,
  );

  manifest.files.latest.before = 'latest.before.json';
  manifest.files.latest.target = path.join(fixture.dir, 'unrelated.json');
  await fs.writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await assert.rejects(
    rollbackPublicLongformInventory(result.manifestPath, { paths: fixture.paths }),
    /target does not match latest/,
  );
});

test('inventory rollback rejects allowed-target swaps, duplicate targets, and missing entries', async () => {
  const fixture = await inventoryFixture();
  const plan = await planPublicLongformInventory({ paths: fixture.paths });
  const result = await applyPublicLongformInventoryPlan(plan, {
    artifactRoot: path.join(fixture.dir, 'artifacts'),
    timestamp: '2026-07-11T00:00:00.000Z',
  });
  const original = JSON.parse(await fs.readFile(result.manifestPath, 'utf8'));
  const writeManifest = (manifest) => fs.writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const swapped = structuredClone(original);
  [swapped.files.latest.target, swapped.files.archived.target] = [swapped.files.archived.target, swapped.files.latest.target];
  await writeManifest(swapped);
  await assert.rejects(rollbackPublicLongformInventory(result.manifestPath, { paths: fixture.paths }), /target does not match archived|target does not match latest/);

  const duplicated = structuredClone(original);
  duplicated.files.latest.target = duplicated.files.archived.target;
  await writeManifest(duplicated);
  await assert.rejects(rollbackPublicLongformInventory(result.manifestPath, { paths: fixture.paths }), /target does not match latest/);

  const missing = structuredClone(original);
  delete missing.files.searchIndex;
  await writeManifest(missing);
  await assert.rejects(rollbackPublicLongformInventory(result.manifestPath, { paths: fixture.paths }), /inventory keys mismatch/);
});

test('inventory rollback authenticates the after snapshot before trusting its digest', async () => {
  const fixture = await inventoryFixture();
  const plan = await planPublicLongformInventory({ paths: fixture.paths });
  const result = await applyPublicLongformInventoryPlan(plan, {
    artifactRoot: path.join(fixture.dir, 'artifacts'),
    timestamp: '2026-07-11T00:00:00.000Z',
  });
  const manifest = JSON.parse(await fs.readFile(result.manifestPath, 'utf8'));
  manifest.files.archived.afterSha256 = 'a'.repeat(64);
  await fs.writeFile(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  await assert.rejects(
    rollbackPublicLongformInventory(result.manifestPath, { paths: fixture.paths }),
    /snapshot checksum mismatch: archived\.after\.json/,
  );
});
