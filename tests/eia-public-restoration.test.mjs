import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  activeRegistryFeeds,
  loadSourceRegistrySync,
  sourceUsageDecision,
} from '../scripts/lib/source-registry.mjs';
import {
  HOMEPAGE_MIN_LOCAL_BLOGS,
  homepageBlogSurfaceResult,
} from '../scripts/lib/homepage-blog-surface-policy.mjs';
import {
  buildEiaRestorationInventory,
  eiaRestorationReaderCopyFindings,
  eiaRestorationSpecs,
} from '../scripts/lib/eia-restoration-inventory.mjs';
import { articleDetailQualityResult } from '../scripts/lib/article-detail-quality-gate.mjs';
import { readerCopyResult } from '../scripts/lib/reader-copy-guard.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { buildRssItems } from '../scripts/lib/rss-builder.mjs';
import { buildSitemapEntries } from '../scripts/lib/sitemap-builder.mjs';
import { publicProductFitResult } from '../scripts/lib/public-product-fit.mjs';
import { editorialArtworkDescriptor } from '../scripts/lib/image-store.mjs';
import { reconcileEiaPublicInventory, resolveSourceTexts, verifyAndStamp } from '../scripts/restore-eia-public-inventory.mjs';
import { extractNumericClaims } from '../scripts/lib/autonomous-desk-utils.mjs';
import { numericClaimKey } from '../scripts/lib/numeric-claim-policy.mjs';
import { unsupportedClaimGuard } from '../scripts/lib/unsupported-claim-guard.mjs';

const imageGeneratorUrl = pathToFileURL(path.resolve('scripts/lib/image-generator.mjs')).href;

function eiaRecords() {
  const evidence = [
    'EIA source evidence documents data centers, electricity demand, grid capacity, utilities, cooling, server load, generation, transmission, interconnection, and regional power planning.',
    'The analysis describes data center operators, capacity planners, investors, and electricity suppliers responding to infrastructure demand and facility schedules.',
  ].join(' ').repeat(12);
  return buildEiaRestorationInventory(Object.fromEntries(eiaRestorationSpecs().map((spec) => [spec.id, evidence])));
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function generateLocalEiaImages(records) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-eia-images-'));
  const inputPath = path.join(directory, 'records.json');
  const outputPath = path.join(directory, 'paths.json');
  const script = [
    "import fs from 'node:fs/promises';",
    `import { ensureArticleImage } from ${JSON.stringify(imageGeneratorUrl)};`,
    "const records = JSON.parse(await fs.readFile(process.argv[1], 'utf8'));",
    'const paths = [];',
    'for (const record of records) paths.push(await ensureArticleImage({ ...record, forcePlaceholderImage: true }));',
    "await fs.writeFile(process.argv[2], JSON.stringify(paths));",
  ].join('\n');
  await fs.writeFile(inputPath, JSON.stringify(records));
  execFileSync(process.execPath, ['--input-type=module', '--eval', script, inputPath, outputPath], {
    cwd: directory,
    env: { ...process.env, IMAGE_PROVIDER: 'local', PIPELINE_OFFLINE: '1' },
  });
  const heroPaths = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  const variants = await Promise.all(records.map(async (record, index) => {
    const base = heroPaths[index].replace(/\/hero\.webp$/, '');
    return {
      id: record.id,
      hero: await fs.readFile(path.join(directory, 'public', heroPaths[index])),
      thumbnail: await fs.readFile(path.join(directory, 'public', `${base}/thumbnail.webp`)),
      og: await fs.readFile(path.join(directory, 'public', `${base}/og.webp`)),
    };
  }));
  return { directory, heroPaths, variants };
}

test('EIA restoration source authorizes public-domain text but not source images', () => {
  const sources = loadSourceRegistrySync();
  const source = sources.find((candidate) => candidate.id === 'eia-today-in-energy');

  assert.ok(source, 'EIA source must be registered');
  assert.equal(source.feed, 'https://www.eia.gov/rss/todayinenergy.xml');
  assert.equal(source.terms_url, 'https://www.eia.gov/about/copyrights_reuse.php');
  assert.equal(
    sourceUsageDecision({ sourceRegistryId: source.id }, sources, 'text', new Date('2026-08-12T00:00:00Z')).authorized,
    true,
  );
  assert.equal(
    sourceUsageDecision({ sourceRegistryId: source.id }, sources, 'image', new Date('2026-08-12T00:00:00Z')).authorized,
    false,
  );
  assert.equal(
    activeRegistryFeeds(sources, new Date('2026-08-12T00:00:00Z')).some((feed) => feed.sourceRegistryId === source.id),
    true,
  );
});

test('quality-first restoration requires five local analyses before normal mode passes', () => {
  const localBlogs = Array.from({ length: 5 }, (_, index) => ({
    id: `restored-analysis-${index}`,
    blog_route: 'standard_blog',
    homepagePublished: true,
    articlePagePublished: true,
    archiveOnly: false,
    noindex: false,
  }));

  assert.equal(HOMEPAGE_MIN_LOCAL_BLOGS, 5);
  assert.equal(homepageBlogSurfaceResult(localBlogs).ok, true);
  assert.equal(homepageBlogSurfaceResult(localBlogs.slice(0, 4)).ok, false);
});

test('EIA restoration inventory exposes fifteen source-backed cards and five local analyses', () => {
  const evidence = [
    'EIA source evidence documents data centers, electricity demand, grid capacity, utilities, cooling, server load, generation, transmission, interconnection, and regional power planning.',
    'The analysis describes data center operators, capacity planners, investors, and electricity suppliers responding to infrastructure demand and facility schedules.',
  ].join(' ').repeat(12);
  const sourceTexts = Object.fromEntries(eiaRestorationSpecs().map((spec) => [spec.id, evidence]));
  const records = buildEiaRestorationInventory(sourceTexts);
  const sources = loadSourceRegistrySync();
  const options = { sourceRegistry: sources, now: '2026-08-12T03:00:00.000Z' };

  assert.equal(records.length, 15);
  assert.equal(new Set(records.map((record) => record.id)).size, 15);
  assert.equal(new Set(records.map((record) => record.sourceUrl)).size, 15);
  assert.equal(records.some((record) => record.sourceImage || record.image || record.imageUrl), false);
  assert.equal(records.filter((record) => record.articlePagePublished).length, 5);
  assert.equal(records.filter((record) => record.signalCardOnly).length, 10);
  assert.ok(records.filter((record) => record.articlePagePublished)
    .every((record) => articleDetailQualityResult(record).ok));
  const homepage = buildHomepageFeed(records, options);
  assert.equal(homepage.items.length, 15);
  assert.equal(
    homepage.items.every((article) => article.publicSignal.why_it_matters === article.public_presentation.why_it_matters),
    true,
  );
  const rssItems = buildRssItems(records, options);
  assert.equal(rssItems.length, 15);
  const signalSpec = eiaRestorationSpecs().find((spec) => spec.id === 'eia-computing-hub-demand');
  const signalRssItem = rssItems.find((item) => item.title === signalSpec.title);
  assert.equal(signalRssItem.description, signalSpec.deck);
  assert.equal(buildSitemapEntries(records, options)
    .filter((entry) => entry.loc.startsWith('/news/')).length, 5);
});

test('EIA restoration moves pipeline-archived restoration records back to their approved public surfaces', () => {
  const restored = eiaRecords();
  const restorationId = restored[0].id;
  const current = { id: 'current-signal' };
  const archived = { id: 'archived-signal' };

  const reconciled = reconcileEiaPublicInventory({
    records: restored,
    latest: [current],
    archived: [{ id: restorationId, archiveOnly: true }, archived],
    search: [{ id: restorationId, archiveOnly: true }, current, archived],
  });

  assert.deepEqual(reconciled.latest.slice(0, restored.length), restored);
  assert.equal(reconciled.latest.filter((record) => record.id === restorationId).length, 1);
  assert.equal(reconciled.archived.some((record) => record.id === restorationId), false);
  assert.equal(reconciled.search.filter((record) => record.id === restorationId).length, 1);
  assert.deepEqual(reconciled.archived, [archived]);
});

test('EIA restoration preserves registered artwork from the matching existing record', () => {
  const [restored] = eiaRecords();
  const latest = JSON.parse(fsSync.readFileSync('src/data/latest-news.json', 'utf8'));
  const existing = latest.find((record) => record.id === restored.id);
  assert.ok(existing?.heroImage && existing?.thumbnailImage && existing?.ogImage);
  const reconciled = reconcileEiaPublicInventory({
    records: [restored],
    latest: [{ id: restored.id }],
    search: [existing],
  });
  const [record] = reconciled.latest;

  for (const field of [
    'heroImage',
    'thumbnailImage',
    'ogImage',
    'generatedImage',
    'generatedImageProvider',
    'generatedImageModel',
    'imageStatus',
  ].filter((field) => existing[field])) {
    assert.equal(record[field], existing[field]);
  }
  assert.equal(record.public_presentation.image, existing.heroImage);
});

test('EIA restoration rejects remote, source-derived, and malformed prior artwork', () => {
  const [restored] = eiaRecords();
  const latest = JSON.parse(fsSync.readFileSync('src/data/latest-news.json', 'utf8'));
  const validLocal = latest.find((record) => record.id === restored.id);
  const otherLocal = latest.find((record) => record.id !== restored.id
    && record.heroImage
    && record.thumbnailImage
    && record.ogImage
    && record.legacyImage);
  assert.ok(validLocal?.heroImage && validLocal?.thumbnailImage && validLocal?.ogImage);
  assert.ok(otherLocal);
  const unsafeCandidates = [
    {
      id: restored.id,
      heroImage: 'https://www.eia.gov/source-chart.png',
      sourceImage: 'https://www.eia.gov/source-chart.png',
      generatedImageProvider: 'source-image',
      imageStatus: 'source-canonical',
    },
    {
      id: restored.id,
      heroImage: 'https://www.eia.gov/remote-hero.webp',
      generatedImageProvider: 'codex',
      imageStatus: 'generated',
    },
    {
      ...validLocal,
      generatedImageProvider: 'source-image',
      imageProvider: 'source-image',
      imageStatus: 'source-canonical',
    },
    {
      ...validLocal,
      sourceImage: validLocal.heroImage,
    },
    {
      ...validLocal,
      thumbnailImage: otherLocal.thumbnailImage,
    },
    {
      ...otherLocal,
      id: restored.id,
    },
    {
      ...validLocal,
      legacyImage: otherLocal.legacyImage,
    },
    {
      id: restored.id,
      heroImage: '/generated/articles/does-not-exist/hero.webp',
      thumbnailImage: '/generated/articles/does-not-exist/thumbnail.webp',
      ogImage: '/generated/articles/does-not-exist/og.webp',
      generatedImageProvider: 'codex',
      imageStatus: 'generated',
    },
    {
      id: restored.id,
      heroImage: '/generated/../generated/fallbacks/power-grid.svg',
      generatedImage: '/generated/../generated/fallbacks/power-grid.svg',
      thumbnailImage: '/generated/../generated/fallbacks/power-grid.svg',
      ogImage: '/generated/../generated/fallbacks/power-grid.svg',
      generatedImageProvider: 'category-fallback',
      imageStatus: 'fallback',
    },
    {
      id: restored.id,
      heroImage: 'generated/articles/malformed/hero.webp',
      generatedImageProvider: 'codex',
      imageStatus: 'generated',
    },
  ];

  for (const existing of unsafeCandidates) {
    const [record] = reconcileEiaPublicInventory({ records: [restored], latest: [existing] }).latest;
    for (const field of [
      'heroImage',
      'thumbnailImage',
      'ogImage',
      'generatedImage',
      'sourceImage',
      'generatedImageProvider',
      'imageProvider',
      'imageStatus',
    ]) {
      assert.equal(record[field], undefined, `${field} must not survive unsafe artwork reconciliation`);
    }
    assert.equal(record.public_presentation.image, undefined);
  }
});

test('EIA restoration preserves an existing trusted local fallback without source provenance', () => {
  const [restored] = eiaRecords();
  const fallback = '/generated/fallbacks/power-grid.svg';
  const existing = {
    id: restored.id,
    generatedImage: fallback,
    generatedImageProvider: 'category-fallback',
    imageProvider: 'category-fallback',
    imageStatus: 'fallback',
  };
  const [record] = reconcileEiaPublicInventory({ records: [restored], latest: [existing] }).latest;

  assert.equal(record.generatedImage, fallback);
  assert.equal(record.public_presentation.image, fallback);
  assert.equal(record.generatedImageProvider, 'category-fallback');
  assert.equal(record.imageStatus, 'fallback');
  assert.equal(record.sourceImage, undefined);
});

test('EIA local artwork is deterministic and article-specific without reusing source images', async () => {
  const records = eiaRecords();
  const first = await generateLocalEiaImages(records);
  const second = await generateLocalEiaImages(records);

  try {
    assert.equal(first.heroPaths.every((image) => image.startsWith('/generated/articles/eia-')), true);
    assert.equal(new Set(first.variants.map((entry) => hash(entry.thumbnail))).size, 15);
    assert.equal(new Set(first.variants.map((entry) => hash(entry.og))).size, 15);
    assert.equal(new Set(first.variants
      .filter((entry) => records.find((record) => record.id === entry.id)?.articlePagePublished)
      .map((entry) => hash(entry.hero))).size, 5);
    assert.deepEqual(
      first.variants.map((entry) => [hash(entry.hero), hash(entry.thumbnail), hash(entry.og)]),
      second.variants.map((entry) => [hash(entry.hero), hash(entry.thumbnail), hash(entry.og)]),
    );
  } finally {
    await fs.rm(first.directory, { recursive: true, force: true });
    await fs.rm(second.directory, { recursive: true, force: true });
  }
});

test('EIA local artwork assigns distinct subject motifs before generic grid language', () => {
  const topics = eiaRecords().map((record) => editorialArtworkDescriptor(record).topic);

  assert.equal(new Set(topics).size >= 6, true);
  assert.deepEqual(new Set(topics), new Set(['compute', 'cooling', 'regional', 'nuclear', 'grid', 'supply', 'solar']));
  assert.equal(editorialArtworkDescriptor({ title: 'Unrelated signal', tags: 'solar' }).topic, 'network');
  assert.equal(editorialArtworkDescriptor({ title: 'Unrelated signal', tags: ['solar'] }).topic, 'solar');
});

test('fossil generation is treated as power infrastructure, not paleontology', () => {
  const specs = eiaRestorationSpecs();
  const evidence = 'Fossil generation could rise with faster electricity demand growth from data centers while grid operators compare generating capacity, natural gas, coal, electricity load, transmission, and wholesale power prices. '.repeat(12);
  const sourceTexts = Object.fromEntries(specs.map((spec) => [spec.id, evidence]));
  const [record] = buildEiaRestorationInventory(sourceTexts);

  assert.equal(publicProductFitResult(record).ok, true);
});

function eiaArticleHtml(text) {
  return `<html><head><title>Today in Energy</title></head><body><div class="tie-article"><h1>Headline</h1><p>${text}</p></div></body></html>`;
}

const restorationEvidence = [
  'EIA source evidence documents data centers, electricity demand, grid capacity, utilities, cooling, server load, generation, transmission, interconnection, and regional power planning.',
  'The analysis describes data center operators, capacity planners, investors, and electricity suppliers responding to infrastructure demand and facility schedules.',
].join(' ').repeat(12);

test('restoration uses live EIA text whenever the article is served in full', async () => {
  const specs = eiaRestorationSpecs().slice(0, 2);
  const logs = [];
  const texts = await resolveSourceTexts(specs, {
    fetchText: async () => eiaArticleHtml(restorationEvidence),
    storedRecords: [],
    log: (line) => logs.push(line),
    retryDelayMs: 0,
  });

  assert.deepEqual(Object.keys(texts), specs.map((spec) => spec.id));
  assert.ok(texts[specs[0].id].length >= 500);
  assert.deepEqual(logs, []);
});

test('restoration reuses the verified committed text when EIA serves a truncated page', async () => {
  const specs = eiaRestorationSpecs().slice(0, 1);
  const stored = buildEiaRestorationInventory({ [specs[0].id]: restorationEvidence });
  const logs = [];
  let calls = 0;
  const texts = await resolveSourceTexts(specs, {
    fetchText: async () => { calls += 1; return eiaArticleHtml('Access denied.'); },
    storedRecords: stored,
    log: (line) => logs.push(line),
    retryDelayMs: 0,
  });

  assert.equal(calls, 2, 'a short page is retried once before falling back');
  assert.equal(texts[specs[0].id], stored[0].extraction_artifact.cleaned_extracted_text);
  assert.equal(buildEiaRestorationInventory(texts)[0].extraction_artifact.extracted_text_sha256, stored[0].extraction_artifact.extracted_text_sha256);
  assert.match(logs[0], /live extraction too short \(\d+\); reusing verified text/);
});

test('restoration fails closed when neither live nor verified committed text exists', async () => {
  const specs = eiaRestorationSpecs().slice(0, 1);
  const wrongSource = buildEiaRestorationInventory({ [specs[0].id]: restorationEvidence }).map((record) => ({
    ...record,
    extraction_artifact: { ...record.extraction_artifact, source_url: 'https://www.eia.gov/todayinenergy/detail.php?id=1' },
  }));
  const tampered = buildEiaRestorationInventory({ [specs[0].id]: restorationEvidence }).map((record) => ({
    ...record,
    extraction_artifact: { ...record.extraction_artifact, cleaned_extracted_text: `${record.extraction_artifact.cleaned_extracted_text} edited.` },
  }));

  for (const storedRecords of [[], wrongSource, tampered]) {
    await assert.rejects(
      () => resolveSourceTexts(specs, {
        fetchText: async () => { throw Object.assign(new Error('source_text_fetch_failed: timeout'), { code: 'timeout' }); },
        storedRecords,
        log: () => {},
        retryDelayMs: 0,
      }),
      /source extraction unavailable: .*live fetch failed \(timeout\) and the committed inventory holds no verified text/,
    );
  }
});

test('EIA restoration specs are checked as reader copy before any record is built', () => {
  // The committed config is clean and every built public record passes the guard.
  assert.deepEqual(eiaRestorationReaderCopyFindings(), []);
  const records = eiaRecords();
  assert.equal(records.filter((record) => record.articlePagePublished).length, 5);
  assert.ok(records.every((record) => readerCopyResult(record).ok));
  assert.ok(records.filter((record) => record.articlePagePublished)
    .every((record) => articleDetailQualityResult(record).readerCopy.findings.length === 0));

  // A spec edit that leaks drafting-process language fails the build, before persistence.
  const tampered = eiaRestorationSpecs();
  const longform = tampered.find((spec) => spec.kind === 'longform');
  const signal = tampered.find((spec) => spec.kind !== 'longform');
  longform.body.push('The supplied extract does not report the 2027 figure.');
  signal.deck = `${signal.deck} I will not invent numbers here.`;
  assert.deepEqual(
    eiaRestorationReaderCopyFindings(tampered).map((finding) => `${finding.id}:${finding.code}:${finding.field}`),
    [`${longform.id}:input_provenance:body`, `${signal.id}:process_assurance:deck`],
  );
  assert.throws(() => buildEiaRestorationInventory({}, { specs: tampered }), /writer-only copy: eia-[a-z-]+:input_provenance:body/);
  // The committed specs are untouched by the tampered clone.
  assert.deepEqual(eiaRestorationReaderCopyFindings(), []);
});

function committedRecords() {
  const read = (file) => JSON.parse(fsSync.readFileSync(path.resolve('src/data', file), 'utf8'));
  return [...read('latest-news.json'), ...read('archived-news.json')];
}

// The verified text the committed inventory holds, as restoration resolves it
// when EIA cannot be reached.
function committedSourceTexts() {
  return resolveSourceTexts(eiaRestorationSpecs(), {
    storedRecords: committedRecords(),
    fetchText: async () => {
      throw Object.assign(new Error('offline'), { code: 'offline' });
    },
    log: () => {},
    retryDelayMs: 0,
  });
}

test('the committed EIA analyses pass the restoration publication gate', async () => {
  // The Mac runner calls restore-eia-public-inventory.mjs before it publishes
  // anything, and hosted validation never ran that gate. Running it here on the
  // committed text makes a spec edit it would reject fail CI first.
  const verified = verifyAndStamp(buildEiaRestorationInventory(await committedSourceTexts()), loadSourceRegistrySync());
  assert.equal(verified.detailRoutes.length, 5);
  const analyses = verified.records.filter((record) => record.articlePagePublished);
  assert.equal(analyses.length, 5);
  assert.ok(analyses.every((record) => record.publication_integrity.ok));
});

test('EIA analyses back each body figure with the source sentence that states it', async () => {
  const texts = await committedSourceTexts();
  for (const record of buildEiaRestorationInventory(texts).filter((item) => item.articlePagePublished)) {
    const source = record.extraction_artifact.cleaned_extracted_text;
    assert.ok(record.claim_ledger.length > 0, record.id);
    for (const claim of record.claim_ledger) {
      assert.equal(claim.verification_status, 'verified_primary');
      assert.equal(claim.source_url, record.sourceUrl);
      assert.ok(source.includes(claim.source_quote_or_summary), `${record.id}: ledger quote is not source text`);
      assert.ok(
        extractNumericClaims(claim.source_quote_or_summary).some((numeric) => numericClaimKey(numeric) === numericClaimKey(claim)),
        `${record.id}: ledger figure is not stated by its quote`,
      );
    }
    assert.ok(unsupportedClaimGuard(record.expertLensFull.finalArticleBody, record.claim_ledger).ok, record.id);
  }

  // The source says "about 14,200 MW". Dropping the qualifier, or adding a
  // figure the source never states, leaves that figure without a ledger row.
  const guardFor = (edit) => {
    const spec = eiaRestorationSpecs().find((item) => item.id === 'eia-texas-large-loads');
    spec.body = spec.body.map(edit);
    const [record] = buildEiaRestorationInventory({ [spec.id]: texts[spec.id] }, { specs: [spec] });
    return unsupportedClaimGuard(record.expertLensFull.finalArticleBody, record.claim_ledger);
  };
  const unqualified = guardFor((block) => block.replace('about 14,200 MW', '14,200 MW'));
  assert.equal(unqualified.ok, false);
  assert.deepEqual(unqualified.unsupportedNumbers.map((claim) => claim.raw), ['14,200 MW']);
  const invented = guardFor((block, index) => (index === 2 ? `${block} The EIA expects 31,337 MW of large flexible load.` : block));
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.unsupportedNumbers.map((claim) => claim.raw), ['31,337 MW']);
});

test('EIA restoration keeps the correction notes and update time readers have seen', async () => {
  const published = new Map(committedRecords().map((record) => [record.id, record]));
  const records = buildEiaRestorationInventory(await committedSourceTexts());
  assert.equal(records.filter((record) => record.corrections).length, 5);
  for (const record of records) {
    // Every note already on the site survives a restoration run.
    for (const note of published.get(record.id)?.corrections || []) {
      assert.ok(
        (record.corrections || []).some((kept) => kept.date === note.date && kept.summary === note.summary),
        `${record.id}: restoration dropped the ${note.date} correction`,
      );
    }
    if (record.corrections) {
      assert.ok(record.updatedAt.slice(0, 10) >= record.corrections.at(-1).date, `${record.id}: updatedAt predates its latest correction`);
    } else {
      assert.equal(record.updatedAt, record.publishedAt);
    }
  }
});
