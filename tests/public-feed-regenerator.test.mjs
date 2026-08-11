import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  publicFeedRegenerationExitCode,
  regeneratePublicFeed,
} from '../scripts/lib/public-feed-regenerator.mjs';
import {
  authorizedAdminSourceRegistry,
  canonicalAdminArticle,
} from './fixtures/admin-publication-integrity.mjs';

const NOW = '2026-08-10T00:00:00.000Z';
const CANONICAL_DATA_PATHS = [
  'src/data/latest-news.json',
  'src/data/archived-news.json',
  'src/data/search-index.json',
  'src/data/taxonomy-pages.json',
];

function canonicalDataHashes() {
  return Object.fromEntries(CANONICAL_DATA_PATHS.map((filePath) => [
    filePath,
    createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
  ]));
}

function longformRoute() {
  return {
    tier: 'longform_analysis',
    score: 0.95,
    evidencePack: {},
  };
}

test('regenerator does not count attempted longforms as approved when final integrity quarantines all candidates', async () => {
  // Given: one routed longform whose generated record has only a bare source URL artifact.
  const source = canonicalAdminArticle();
  const generated = {
    ...canonicalAdminArticle({ published: true }),
    extraction_artifact: { source_url: source.sourceUrl },
  };
  const before = canonicalDataHashes();

  // When: regeneration runs without writing repository data.
  const result = await regeneratePublicFeed({
    records: [source],
    writeOutputs: false,
    sourceRegistry: authorizedAdminSourceRegistry(),
    now: NOW,
    routeArticle: longformRoute,
    generateLongform: () => generated,
    longformTarget: 1,
    briefTarget: 0,
  });

  // Then: attempted work is separate from approved public inventory and normal mode fails.
  assert.equal(result.mode, 'normal');
  assert.equal(result.ok, false);
  assert.equal(result.counts.attemptedLongform, 1);
  assert.equal(result.counts.approvedLongform, 0);
  assert.equal(result.counts.publicationIntegrityBlocked, 1);
  assert.equal(result.counts.homepagePublic, 0);
  assert.equal(publicFeedRegenerationExitCode(result), 1);
  assert.deepEqual(canonicalDataHashes(), before);
});

test('regenerator reports only post-integrity approved longforms as successful', async () => {
  // Given: a valid immutable artifact and an explicitly authorized source.
  const source = canonicalAdminArticle();
  const generated = canonicalAdminArticle({ published: true });
  const before = canonicalDataHashes();

  // When: regeneration runs through the same final boundary without data writes.
  const result = await regeneratePublicFeed({
    records: [source],
    writeOutputs: false,
    sourceRegistry: authorizedAdminSourceRegistry(),
    now: NOW,
    routeArticle: longformRoute,
    generateLongform: () => generated,
    longformTarget: 1,
    briefTarget: 0,
    minimumHomepagePublic: 1,
    minimumApprovedLongform: 1,
  });

  // Then: the approved counter and readiness reflect the persisted public detail.
  assert.equal(result.mode, 'normal');
  assert.equal(result.ok, true);
  assert.equal(result.counts.attemptedLongform, 1);
  assert.equal(result.counts.approvedLongform, 1);
  assert.equal(result.counts.publicationIntegrityBlocked, 0);
  assert.equal(result.counts.homepagePublic, 1);
  assert.equal(publicFeedRegenerationExitCode(result), 0);
  assert.deepEqual(canonicalDataHashes(), before);
});

test('regenerator reports explicit safe mode instead of readiness when no text source is authorized', async () => {
  // Given: a candidate exists but the current registry authorizes no source text.
  const source = canonicalAdminArticle();
  const before = canonicalDataHashes();

  // When: regeneration evaluates the candidate without writing repository data.
  const result = await regeneratePublicFeed({
    records: [source],
    writeOutputs: false,
    sourceRegistry: [],
    now: NOW,
    routeArticle: longformRoute,
    generateLongform: () => canonicalAdminArticle({ published: true }),
    longformTarget: 1,
    briefTarget: 0,
  });

  // Then: safe mode is operationally successful but never claims active-publication readiness.
  assert.equal(result.mode, 'rights_review_safe_mode');
  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.counts.approvedLongform, 0);
  assert.equal(result.counts.homepagePublic, 0);
  assert.equal(publicFeedRegenerationExitCode(result), 0);
  assert.deepEqual(canonicalDataHashes(), before);
});
