import assert from 'node:assert/strict';
import test from 'node:test';
import { buildArchiveFeed } from '../scripts/lib/archive-feed-builder.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import {
  isPublicProductFit,
  publicProductFitResult,
} from '../scripts/lib/public-product-fit.mjs';
import { buildRssItems } from '../scripts/lib/rss-builder.mjs';
import { buildSitemapEntries } from '../scripts/lib/sitemap-builder.mjs';
import { publicTaxonomyItems } from '../scripts/lib/taxonomy-page-builder.mjs';
import { createExtractionArtifact } from '../scripts/lib/extraction-artifact.mjs';
import { authorizePublicTestRecords } from './fixtures/admin-publication-integrity.mjs';

const published = {
  publishedAt: '2026-08-09T00:00:00.000Z',
  homepagePublished: true,
  articlePagePublished: false,
  archiveOnly: false,
  public_status: 'published',
  public_content_tier: 'signal_card',
  noindex: false,
  seo_noindex: false,
  sourceUrl: 'https://example.com/source',
  extraction_quality_score: 0.95,
};

function verifiedExtractionArtifact(sourceUrl, sentence) {
  const cleanedExtractedText = Array.from({ length: 8 }, (_, index) => (
    `${sentence} Source paragraph ${index + 1} records a distinct verified project milestone.`
  )).join(' ');
  return createExtractionArtifact({
    sourceUrl,
    cleanedExtractedText,
    extractionQa: {
      public_publishable: true,
      can_generate_longform: true,
      sentence_completion_score: 1,
    },
  });
}

const consumerRecords = [
  {
    id: '01f53af419a55a0b',
    title: 'Hideo Kojima unveils a Death Stranding 2-themed wireless CD player',
    summary: 'The limited-edition device plays CDs and includes game-themed controls.',
  },
  {
    id: '3b9b25a9feefb6b8',
    title: 'Turtle Beach Command Series KB5 Review: A touchscreen and a numberpad in one keyboard?',
    summary: 'The gaming keyboard combines a touchscreen, numberpad, and desktop controls.',
  },
  {
    id: 'c346fc277f42c8b2',
    title: 'Lost one-of-a-kind Nintendo DS cartridge hits eBay for $9,100',
    summary: 'The rare game cartridge was made for a Pokemon fishing contest.',
  },
].map((record, index) => ({
  ...published,
  ...record,
  publishedAt: `2026-08-09T00:00:0${index}.000Z`,
  infrastructure_relevance_score: 0.97,
  primary_category: 'AI Infrastructure',
  infrastructure_layer: 'Compute',
  tags: ['power', 'grid', 'cloud'],
  public_routing: { visibility: 'core' },
  articleText: Array.from({ length: 10 }, (_, paragraph) => (
    `${record.summary} Source evidence ${paragraph + 1} describes the consumer product and its release details.`
  )).join(' '),
  deck: 'Utility procurement and substation timing now shape capacity delivery.',
  why_it_matters: 'Operators should watch power availability and grid execution.',
}));

const relevantRecords = [
  {
    id: 'data-center-control',
    title: 'Liquid cooling retrofit raises rack density at an AI data center',
    summary: 'The operator installed direct-to-chip cooling across GPU racks in its existing data center.',
  },
  {
    id: 'power-control',
    title: 'Utility approves 765 kV transmission line for data center load',
    summary: 'The grid project adds substation and interconnection capacity for large data center campuses.',
  },
  {
    id: 'silicon-control',
    title: 'Synopsys releases CXL 4.0 IP for accelerator memory systems',
    summary: 'Compute Express Link 4.0 connects CPUs, accelerators, and memory expansion in data center servers.',
  },
].map((record, index) => ({
  ...published,
  ...record,
  publishedAt: `2026-08-08T00:00:0${index}.000Z`,
  primary_category: 'Data Centers',
  infrastructure_layer: 'Compute',
  public_routing: { visibility: 'adjacent' },
  articleText: Array.from({ length: 10 }, (_, paragraph) => (
    `${record.summary} Source evidence ${paragraph + 1} identifies operator capacity, procurement, and deployment timing.`
  )).join(' '),
}));

for (const record of [...consumerRecords, ...relevantRecords]) {
  record.sourceUrl = `https://example.com/${record.id}`;
}

test('public product fit ignores synthetic infrastructure metadata on consumer stories', () => {
  for (const article of consumerRecords) {
    const result = publicProductFitResult(article, {
      deck: article.deck,
      why_it_matters: article.why_it_matters,
    });
    assert.equal(result.ok, false, `${article.id} must fail closed`);
    assert.ok(result.reasons.length > 0);
  }
});

test('generated infrastructure fields cannot lift a consumer source title without verified extraction evidence', () => {
  const article = {
    ...published,
    id: 'consumer-earbuds-generated-framing',
    title: 'Wireless earbuds review: spatial audio and battery life tested',
    sourceUrl: 'https://consumer.example/earbuds-review',
    summary: 'AI data centers need liquid cooling, grid interconnection, and GPU rack capacity.',
    snippet: 'The utility approved a substation for a hyperscale AI campus.',
    articleText: 'Semiconductor supply and high-bandwidth memory shape accelerator deployment.',
    cleaned_source_text: 'Data center power procurement and transmission timing constrain cloud capacity.',
    expertLensFull: {
      finalHeadline: 'Grid capacity changes AI data center deployment',
      finalArticleBody: 'Generated infrastructure analysis.',
    },
    infrastructure_relevance_score: 0.867,
    primary_category: 'AI Infrastructure',
    infrastructure_layer: 'Power & Grid',
    tags: ['data center', 'liquid cooling', 'semiconductors'],
  };

  const result = publicProductFitResult(article);

  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('missing_verified_source_evidence'));
});

test('tampered extraction text cannot provide product-fit evidence', () => {
  const artifact = createExtractionArtifact({
    sourceUrl: 'https://consumer.example/earbuds-review',
    cleanedExtractedText: 'The review compares wireless earbuds, battery life, and audio controls.',
  });
  const article = {
    ...published,
    id: 'consumer-earbuds-tampered-artifact',
    title: 'Wireless earbuds review: spatial audio and battery life tested',
    sourceUrl: artifact.source_url,
    summary: 'AI data centers need grid capacity and liquid cooling.',
    extraction_artifact: {
      ...artifact,
      cleaned_extracted_text: 'AI data centers need grid capacity and liquid cooling.',
    },
  };

  const result = publicProductFitResult(article);

  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('missing_verified_source_evidence'));
});

test('hash-verified extraction evidence can establish product fit when the source title is not decisive', () => {
  const sourceUrl = 'https://utility.example/project-approval';
  const article = {
    ...published,
    id: 'verified-grid-artifact-control',
    title: 'State commission approves the project',
    sourceUrl,
    extraction_artifact: verifiedExtractionArtifact(
      sourceUrl,
      'The utility approved a 765 kV transmission line, substation work, and interconnection capacity for large AI data center campuses.',
    ),
  };

  assert.equal(isPublicProductFit(article), true);
});

test('an extraction artifact from a different source URL cannot establish product fit', () => {
  const article = {
    ...published,
    id: 'mismatched-grid-artifact',
    title: 'Wireless earbuds review: spatial audio and battery life tested',
    sourceUrl: 'https://consumer.example/earbuds-review',
    extraction_artifact: verifiedExtractionArtifact(
      'https://unrelated.example/data-center-project',
      'The utility approved grid interconnection capacity for a large AI data center campus.',
    ),
  };

  const result = publicProductFitResult(article);

  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('missing_verified_source_evidence'));
});

test('public product fit accepts source-backed data center, power, and silicon controls', () => {
  for (const article of relevantRecords) {
    assert.equal(isPublicProductFit(article), true, `${article.id} should remain eligible`);
  }
});

test('public product fit rejects forbidden generic framing on an otherwise relevant story', () => {
  const result = publicProductFitResult(relevantRecords[0], {
    deck: 'The issue is no longer demand alone; it is whether the surrounding infrastructure is ready.',
    why_it_matters: 'Operators should watch the cooling retrofit schedule.',
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.startsWith('forbidden_phrase:')));
});

test('all public feed surfaces share the fail-closed product-fit boundary and backfill with relevant records', () => {
  const authorized = authorizePublicTestRecords([...consumerRecords, ...relevantRecords]);
  const source = authorized.records;
  const homepage = buildHomepageFeed(source, { ...authorized.options, limit: 3, minimumVisible: 3 });
  const archive = buildArchiveFeed(source, { ...authorized.options, pageSize: 3 });
  const taxonomy = publicTaxonomyItems(source);
  const rss = buildRssItems(source, authorized.options);
  const sitemap = buildSitemapEntries(source.map((item) => ({
    ...item,
    articlePagePublished: true,
    public_content_tier: 'longform_analysis',
  })), authorized.options);

  assert.deepEqual(homepage.items.map((item) => item.id).sort(), relevantRecords.map((item) => item.id).sort());
  assert.deepEqual(archive.items.map((item) => item.id).sort(), relevantRecords.map((item) => item.id).sort());
  assert.equal(archive.total, relevantRecords.length);
  assert.deepEqual(taxonomy.map((item) => item.id).sort(), relevantRecords.map((item) => item.id).sort());
  assert.deepEqual(rss.map((item) => item.link).sort(), relevantRecords.map((item) => item.sourceUrl).sort());
  for (const article of consumerRecords) {
    assert.equal(sitemap.some((entry) => entry.loc === `/news/${article.id}/`), false);
  }
});
