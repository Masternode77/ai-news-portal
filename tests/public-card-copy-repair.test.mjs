import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  immutableCorpusDigest,
  repairPublicCardCorpus,
  repairPublicCardRecord,
  restorePublicSourceSignals,
  runPublicCardCopyRepair,
} from '../scripts/repair-public-card-copy.mjs';
import { writeJsonFile } from '../scripts/lib/state-store.mjs';
import { sanitizeArticleSourceEvidence } from '../scripts/lib/source-evidence-integrity.mjs';

async function temporaryRepairPaths() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-card-repair-'));
  return {
    root,
    paths: {
      latest: path.join(root, 'latest-news.json'),
      archive: path.join(root, 'archived-news.json'),
      search: path.join(root, 'search-index.json'),
      taxonomy: path.join(root, 'taxonomy-pages.json'),
      taxonomyReport: path.join(root, 'taxonomy-report.md'),
      report: path.join(root, 'repair-report.md'),
    },
  };
}

async function seedRepairPaths(paths, latest, archive, search = [...latest, ...archive]) {
  await writeJsonFile(paths.latest, latest);
  await writeJsonFile(paths.archive, archive);
  await writeJsonFile(paths.search, search);
  await writeJsonFile(paths.taxonomy, { old: true });
  await fs.writeFile(paths.taxonomyReport, 'old taxonomy report\n', 'utf8');
  await fs.writeFile(paths.report, 'old repair report\n', 'utf8');
}

async function readFiles(paths) {
  return Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, filePath]) => [
    key,
    await fs.readFile(filePath, 'utf8'),
  ])));
}

function legacyRecord(overrides = {}) {
  return {
    id: 'legacy-card',
    title: 'Utility filing sets a 2028 campus energization target',
    source: 'Utility Filing',
    sourceUrl: 'https://example.com/utility-filing',
    contentText: 'A utility filing gives the AI data center campus a 2028 energization target and identifies the substation equipment required before commissioning. The filing does not identify a final tenant.',
    articleText: 'Full extracted source evidence remains unchanged.',
    generatedImage: '/generated/articles/legacy-card/hero.webp',
    deck: 'The campus ties AI buildout timing to power procurement; the practical checkpoint is substation delivery.',
    summary: 'The campus ties AI buildout timing to power procurement; the practical checkpoint is substation delivery.',
    snippet: 'The campus ties AI buildout timing to power procurement; the practical checkpoint is substation delivery.',
    why_it_matters: 'The exposed dependency is utility energization.',
    public_presentation: {
      deck: 'The practical checkpoint is substation delivery.',
      why_it_matters: 'The exposed dependency is utility energization.',
      image: '/generated/articles/legacy-card/thumbnail.webp',
    },
    ...overrides,
  };
}

test('public card repair replaces legacy formulas with source text and preserves immutable fields', () => {
  const original = legacyRecord();
  const result = repairPublicCardRecord(original);

  assert.equal(result.changed, true);
  assert.match(result.article.deck, /2028 energization target/);
  assert.equal(result.article.why_it_matters, '');
  assert.equal(result.article.public_presentation.why_it_matters, '');
  assert.doesNotMatch(result.article.searchText, /ties AI buildout timing|the practical checkpoint|the exposed dependency/i);
  assert.equal(result.article.contentText, original.contentText);
  assert.equal(result.article.articleText, original.articleText);
  assert.equal(result.article.generatedImage, original.generatedImage);
  assert.equal(result.article.public_presentation.image, original.public_presentation.image);
  assert.doesNotMatch(JSON.stringify(result.article), /ties AI buildout timing|the practical checkpoint|the exposed dependency/i);
  assert.equal(immutableCorpusDigest([original]), immutableCorpusDigest([result.article]));
});

test('public card repair is idempotent', () => {
  const first = repairPublicCardCorpus([legacyRecord()]);
  const second = repairPublicCardCorpus(first.records);

  assert.equal(first.changed.length, 1);
  assert.equal(first.repaired.length, 1);
  assert.equal(first.quarantined.length, 0);
  assert.equal(second.changed.length, 0);
  assert.equal(second.repaired.length, 0);
  assert.deepEqual(second.records, first.records);
});

test('public card repair strips generated scaffolding from trusted source fields', () => {
  const sourceSentence = 'A utility filing says the 620 MW data center campus cannot energize before two substations are delivered.';
  const contaminated = `${sourceSentence} Why it matters: compute constraints can change build schedules, buyer commitments, and cost assumptions before demand shows up in revenue.`;
  const result = repairPublicCardRecord(legacyRecord({
    cleaned_source_text: contaminated,
    contentText: contaminated,
    articleText: contaminated,
    public_status: 'signal',
    public_content_tier: 'signal_card',
    homepagePublished: true,
    articlePagePublished: false,
    archiveOnly: false,
  }));

  assert.equal(result.changed, true);
  assert.equal(result.sourceEvidenceRepaired, true);
  assert.equal(result.article.cleaned_source_text, sourceSentence);
  assert.equal(result.article.contentText, sourceSentence);
  assert.equal(result.article.articleText, sourceSentence);
  assert.doesNotMatch(JSON.stringify(result.article), /Why it matters:/i);
});

test('source evidence repair preserves legitimate publisher why-it-matters text', () => {
  const publisherText = 'The regulator approved the substation plan. Why it matters: the ruling sets utility cost allocation for the next five years.';
  const result = sanitizeArticleSourceEvidence({
    title: 'Regulator approves substation plan',
    cleaned_source_text: publisherText,
    contentText: publisherText,
    articleText: publisherText,
  });

  assert.equal(result.changed, false);
  assert.equal(result.article.cleaned_source_text, publisherText);
  assert.equal(result.article.contentText, publisherText);
  assert.equal(result.article.articleText, publisherText);
});

test('public card corpus quarantines source signals that fail the shared card quality gate', () => {
  const first = repairPublicCardCorpus([legacyRecord({
    title: 'Moving Defect Detection And Classification To The Edge',
    contentText: 'The number of defects detected through inspection is exploding at each new process node.',
    deck: 'The number of defects detected through inspection is exploding at each new process node.',
    summary: 'The number of defects detected through inspection is exploding at each new process node.',
    public_presentation: {
      deck: 'The number of defects detected through inspection is exploding at each new process node.',
      why_it_matters: '',
      image: '/generated/articles/legacy-card/thumbnail.webp',
    },
    public_status: 'signal',
    public_content_tier: 'signal_card',
    homepagePublished: true,
    articlePagePublished: false,
    archiveOnly: false,
  })]);
  const [result] = first.records;

  assert.equal(result.homepagePublished, false);
  assert.equal(result.public_content_tier, 'hidden');
  assert.equal(result.quarantine_reason, 'card_copy_quality_gate_failed');
  const second = repairPublicCardCorpus(first.records);
  assert.equal(second.changed.length, 0);
  assert.deepEqual(second.records, first.records);
});

test('public card repair replaces a truncated source-signal deck with the complete source sentence', () => {
  const result = repairPublicCardRecord(legacyRecord({
    title: 'TSMC CEO C.C. Wei says capacity will remain tight',
    contentText: 'TSMC says it lacks enough capacity for AI hyperscaler demand, with CEO C.C. Wei saying it will take a long time to match customer demand.',
    deck: 'TSMC says it lacks enough capacity for AI hyperscaler demand, with CEO C.C.',
    summary: 'TSMC says it lacks enough capacity for AI hyperscaler demand, with CEO C.C.',
    snippet: 'TSMC says it lacks enough capacity for AI hyperscaler demand, with CEO C.C.',
    why_it_matters: '',
    public_presentation: {
      deck: 'TSMC says it lacks enough capacity for AI hyperscaler demand, with CEO C.C.',
      why_it_matters: '',
      image: '/generated/articles/legacy-card/thumbnail.webp',
    },
    public_status: 'signal',
    public_content_tier: 'signal_card',
    homepagePublished: true,
    articlePagePublished: false,
    archiveOnly: false,
  }));

  assert.equal(result.reason, 'source_excerpt_repair');
  assert.match(result.article.public_presentation.deck, /C\.C\. Wei saying it will take a long time/);
  assert.doesNotMatch(result.article.public_presentation.deck, /C\.C\.$/);
});

test('public card repair quarantines a record when no safe source excerpt exists', () => {
  const result = repairPublicCardRecord(legacyRecord({
    contentText: '',
    articleText: '',
    rawText: '',
  }));

  assert.equal(result.changed, true);
  assert.equal(result.reason, 'quarantined_missing_source_excerpt');
  assert.equal(result.article.public_status, 'archive_only_noindex');
  assert.equal(result.article.public_content_tier, 'hidden');
  assert.equal(result.article.homepagePublished, false);
  assert.equal(result.article.archiveOnly, true);
  assert.equal(result.article.quarantine_reason, 'missing_source_grounded_card_copy');
});

test('public card repair quarantines a public candidate even when its clean-looking deck has no source evidence', () => {
  const result = repairPublicCardRecord(legacyRecord({
    contentText: '',
    extractedText: '',
    sourceText: '',
    rawText: '',
    snippet: 'A generated digest says the data center campus has a 2028 energization target.',
    deck: 'A generated digest says the data center campus has a 2028 energization target.',
    summary: 'A generated digest says the data center campus has a 2028 energization target.',
    public_presentation: {
      deck: 'A generated digest says the data center campus has a 2028 energization target.',
      why_it_matters: '',
      image: '/generated/articles/legacy-card/thumbnail.webp',
    },
    public_status: 'signal',
    public_content_tier: 'signal_card',
    homepagePublished: true,
    archiveOnly: false,
  }));

  assert.equal(result.reason, 'quarantined_missing_source_excerpt');
  assert.equal(result.article.homepagePublished, false);
  assert.equal(result.article.public_content_tier, 'hidden');
});

test('public source signal restoration only promotes allowlisted, source-grounded records', () => {
  const eligible = legacyRecord({
    id: 'restore-me',
    deck: 'A utility filing gives the AI data center campus a 2028 energization target.',
    summary: 'A utility filing gives the AI data center campus a 2028 energization target.',
    snippet: 'A utility filing gives the AI data center campus a 2028 energization target.',
    why_it_matters: '',
    public_presentation: {
      deck: 'A utility filing gives the AI data center campus a 2028 energization target.',
      why_it_matters: '',
      image: '/generated/articles/restore-me/thumbnail.webp',
    },
    public_status: 'archive_only_noindex',
    public_content_tier: 'hidden',
    homepagePublished: false,
    articlePagePublished: false,
    archiveOnly: true,
    noindex: true,
    seo_noindex: true,
    seo_noindex_reasons: ['stale_noindex'],
    archiveOnlyReason: 'stale_archive_reason',
    qualityGateBlocked: true,
    qualityGateReason: 'stale_quality_reason',
    qualityGateBlockedAt: '2026-05-01T00:00:00.000Z',
    routing_decision: 'archive_only',
    public_routing: {
      visibility: 'archive',
      routing_decision: 'archive_only',
      blocked_reasons: ['stale_archive_reason'],
    },
    infrastructure_relevance_score: 0.9,
    infrastructure_relevance_tier: 'archive_only',
    infrastructure_relevance_action: 'archive_only',
    infrastructureRelevanceAction: 'archive_only',
    infrastructure_relevance: {
      infrastructure_relevance_tier: 'archive_only',
      infrastructure_relevance_action: 'archive_only',
      articlePagePublished: false,
      homepagePublished: false,
      archiveOnly: true,
      archiveOnlyReason: 'stale_archive_reason',
    },
    article_blueprint: { stale: true },
    articleBlueprint: { stale: true },
  });
  const untouched = { ...eligible, id: 'leave-hidden' };
  const result = restorePublicSourceSignals([eligible, untouched], new Set(['restore-me']));

  assert.equal(result.restored.length, 1);
  assert.equal(result.records[0].public_status, 'signal');
  assert.equal(result.records[0].public_content_tier, 'signal_card');
  assert.equal(result.records[0].homepagePublished, true);
  assert.equal(result.records[0].articlePagePublished, false);
  assert.equal(result.records[0].archiveOnly, false);
  assert.equal(result.records[0].noindex, false);
  assert.equal(result.records[0].seo_noindex, false);
  assert.deepEqual(result.records[0].seo_noindex_reasons, []);
  assert.equal(result.records[0].archiveOnlyReason, null);
  assert.equal(result.records[0].qualityGateBlocked, false);
  assert.equal(result.records[0].qualityGateReason, '');
  assert.equal('qualityGateBlockedAt' in result.records[0], false);
  assert.equal(result.records[0].routing_decision, 'source_signal');
  assert.equal(result.records[0].public_routing.visibility, 'core');
  assert.equal(result.records[0].public_routing.routing_decision, 'source_signal');
  assert.deepEqual(result.records[0].public_routing.blocked_reasons, []);
  assert.equal(result.records[0].infrastructure_relevance_tier, 'signal_card');
  assert.equal(result.records[0].infrastructure_relevance_action, 'publish_signal_card_only');
  assert.equal(result.records[0].infrastructure_relevance.archiveOnly, false);
  assert.equal(result.records[0].article_blueprint, null);
  assert.equal(result.records[0].articleBlueprint, null);
  assert.match(result.records[0].public_presentation.deck, /2028 energization target/);
  assert.equal(result.records[1].public_content_tier, 'hidden');

  const repeated = restorePublicSourceSignals(result.records, new Set(['restore-me']));
  assert.equal(repeated.restored.length, 0);
  assert.deepEqual(repeated.records, result.records);
});

test('public source signal restoration rejects allowlisted records without source copy, a safe URL, or an image', () => {
  const missingSource = legacyRecord({
    id: 'missing-source',
    contentText: '',
    articleText: '',
    rawText: '',
  });
  const missingImage = legacyRecord({
    id: 'missing-image',
    generatedImage: '',
    sourceImage: '',
    heroImage: '',
    thumbnailImage: '',
    public_presentation: {},
  });
  const unsafeUrl = legacyRecord({
    id: 'unsafe-url',
    sourceUrl: 'http://localhost:3000/private-source',
    url: '',
  });
  const result = restorePublicSourceSignals(
    [missingSource, missingImage, unsafeUrl],
    new Set(['missing-source', 'missing-image', 'unsafe-url']),
  );

  assert.equal(result.restored.length, 0);
  assert.deepEqual(result.records, [missingSource, missingImage, unsafeUrl]);
});

test('public source signal restoration rejects an allowlisted record that fails the final public surface gate', () => {
  const ineligible = legacyRecord({
    id: 'restore-but-not-relevant',
    title: 'AIC Gets Flashy with 32 SSD Bay JBOF Server for Key Value Caching',
    source: 'ServeTheHome',
    sourceUrl: 'https://example.com/aic-jbof',
    contentText: 'In preparation for the Rubin Vera era, AIC showed its F2032-01-G6, a 2U JBOF system that can house up to 32 E3 SSDs.',
    deck: 'In preparation for the Rubin Vera era, AIC showed its F2032-01-G6, a 2U JBOF system that can house up to 32 E3 SSDs.',
    summary: 'In preparation for the Rubin Vera era, AIC showed its F2032-01-G6, a 2U JBOF system that can house up to 32 E3 SSDs.',
    why_it_matters: '',
    public_presentation: {
      deck: 'In preparation for the Rubin Vera era, AIC showed its F2032-01-G6, a 2U JBOF system that can house up to 32 E3 SSDs.',
      why_it_matters: '',
      image: '/generated/articles/restore-but-not-relevant/thumbnail.webp',
    },
    public_status: 'signal',
    public_content_tier: 'signal_card',
    homepagePublished: true,
    articlePagePublished: false,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    infrastructure_relevance_score: 0.91,
    infrastructure_relevance: { infrastructure_relevance_score: 0.91 },
    public_routing: { score: 0.91, visibility: 'core' },
    primary_category: 'AI Infrastructure',
    category: 'AI Infrastructure',
    infrastructure_layer: 'Compute',
    tags: ['gpu'],
    affected_stakeholders: ['operators', 'hyperscalers', 'cloud buyers', 'investors'],
  });
  const result = restorePublicSourceSignals([ineligible], new Set([ineligible.id]));

  assert.equal(result.restored.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.records[0].homepagePublished, false);
  assert.equal(result.records[0].public_status, 'archive_only_noindex');
  assert.equal(result.records[0].quarantine_reason, 'source_relevance_gate_failed');

  const repeated = restorePublicSourceSignals(result.records, new Set([ineligible.id]));
  assert.equal(repeated.restored.length, 0);
  assert.equal(repeated.rejected.length, 0);
  assert.deepEqual(repeated.records, result.records);
});

test('public card repair refuses malformed required data before writing', async (context) => {
  const { root, paths } = await temporaryRepairPaths();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(paths.latest, '{not-json', 'utf8');
  await writeJsonFile(paths.archive, []);
  await writeJsonFile(paths.search, []);
  let writes = 0;

  await assert.rejects(
    runPublicCardCopyRepair({
      apply: true,
      paths,
      writeJson: async () => {
        writes += 1;
      },
    }),
    /invalid JSON in required latest-news data/,
  );
  assert.equal(writes, 0);
});

test('public card repair rolls every output back when a write fails', async (context) => {
  const { root, paths } = await temporaryRepairPaths();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await seedRepairPaths(
    paths,
    [legacyRecord({ id: 'latest-record', searchText: 'stale latest search' })],
    [legacyRecord({ id: 'archive-record', searchText: 'stale archive search' })],
  );
  const before = await readFiles(paths);
  let writes = 0;

  await assert.rejects(
    runPublicCardCopyRepair({
      apply: true,
      paths,
      writeJson: async (filePath, value) => {
        writes += 1;
        if (writes === 2) throw new Error('injected archive write failure');
        await writeJsonFile(filePath, value);
      },
    }),
    /injected archive write failure/,
  );

  assert.deepEqual(await readFiles(paths), before);
});

test('public card repair writes one canonical searchText across all public datasets', async (context) => {
  const { root, paths } = await temporaryRepairPaths();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const latest = legacyRecord({
    id: 'latest-search-record',
    deck: 'A utility filing identifies a 2028 substation delivery date for an AI data center campus.',
    summary: 'A utility filing identifies a 2028 substation delivery date for an AI data center campus.',
    snippet: 'A utility filing identifies a 2028 substation delivery date for an AI data center campus.',
    why_it_matters: '',
    searchText: 'stale latest search',
    public_presentation: {
      deck: 'A utility filing identifies a 2028 substation delivery date for an AI data center campus.',
      why_it_matters: '',
      image: '/generated/articles/latest-search-record/thumbnail.webp',
    },
  });
  const archive = {
    ...latest,
    id: 'archive-search-record',
    sourceUrl: 'https://example.com/archive-search-record',
    searchText: 'stale archive search',
  };
  await seedRepairPaths(paths, [latest], [archive]);

  await runPublicCardCopyRepair({
    apply: true,
    paths,
    rebuildTaxonomy: async () => ({}),
  });

  const latestOutput = JSON.parse(await fs.readFile(paths.latest, 'utf8'));
  const archiveOutput = JSON.parse(await fs.readFile(paths.archive, 'utf8'));
  const searchOutput = JSON.parse(await fs.readFile(paths.search, 'utf8'));
  const canonicalById = new Map(searchOutput.map((record) => [record.id, record.searchText]));
  for (const record of [...latestOutput, ...archiveOutput]) {
    assert.equal(record.searchText, canonicalById.get(record.id));
    assert.doesNotMatch(record.searchText, /stale .* search/);
  }
});

test('public card repair dry-run reports a stale search-index projection', async (context) => {
  const { root, paths } = await temporaryRepairPaths();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const canonical = repairPublicCardRecord(legacyRecord({ id: 'stale-search-artifact' })).article;
  await seedRepairPaths(paths, [canonical], [], [{ ...canonical, searchText: 'stale search artifact' }]);

  const result = await runPublicCardCopyRepair({ apply: false, paths });

  assert.equal(result.changed, 0);
  assert.equal(result.searchArtifactMismatches, 1);
});

test('public card repair preserves synchronized search images and is artifact-idempotent', async (context) => {
  const { root, paths } = await temporaryRepairPaths();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const article = legacyRecord({
    id: 'image-sync-record',
    searchText: 'stale search text',
    generatedImage: '/generated/fallbacks/power-grid.svg',
    primary_category: 'Power & Grid',
  });
  const searchRecord = {
    ...article,
    public_presentation: {
      ...article.public_presentation,
      id: article.id,
      image: '/generated/fallbacks/power-grid.svg',
      image_alt: 'Utility filing editorial visual',
    },
  };
  await seedRepairPaths(paths, [article], [], [searchRecord]);

  const options = {
    apply: true,
    paths,
    rebuildTaxonomy: async () => ({}),
  };
  await runPublicCardCopyRepair(options);
  const first = await readFiles({
    latest: paths.latest,
    archive: paths.archive,
    search: paths.search,
  });
  const firstSearch = JSON.parse(first.search);
  assert.equal(firstSearch[0].public_presentation.id, article.id);
  assert.equal(firstSearch[0].public_presentation.image, '/generated/fallbacks/power-grid.svg');
  assert.equal(firstSearch[0].public_presentation.image_alt, 'Utility filing sets a 2028 campus energization target editorial visual');

  await runPublicCardCopyRepair(options);
  assert.deepEqual(await readFiles({
    latest: paths.latest,
    archive: paths.archive,
    search: paths.search,
  }), first);
});

test('public card repair defaults are independent of the caller working directory', async () => {
  const previousDirectory = process.cwd();
  process.chdir(os.tmpdir());
  try {
    const result = await runPublicCardCopyRepair({ apply: false });
    assert.ok(result.records > 0);
  } finally {
    process.chdir(previousDirectory);
  }
});
