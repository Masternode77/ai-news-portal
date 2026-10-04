import test from 'node:test';
import assert from 'node:assert/strict';
import { columnArtworkReadiness } from '../scripts/lib/column-artwork-readiness.mjs';
import { prepareCodexImageQueue, parseArgs } from '../scripts/prepare-codex-images.mjs';
import { artworkColumn, artworkSource } from './fixtures/column-artwork.mjs';
import { FIXTURE_SOURCE } from './fixtures/authored-column-fixture.mjs';

const options = { sourceRegistry: [FIXTURE_SOURCE], now: '2026-08-10' };

test('column artwork requires current rights, intact source evidence and authored quality', () => {
  const column = artworkColumn();
  const source = artworkSource();
  const result = columnArtworkReadiness(column, [source], [], options);
  assert.equal(result.ok, true, result.reasons.join('; '));
  assert.ok(result.metrics.words >= 1000);
  assert.equal(columnArtworkReadiness(column, [], [], options).ok, false);
  assert.equal(columnArtworkReadiness(column, [source], [], { ...options, sourceRegistry: [] }).ok, false);
  const badHash = { ...source, extraction_artifact: { ...source.extraction_artifact, extracted_text_sha256: '0'.repeat(64) } };
  assert.equal(columnArtworkReadiness(column, [badHash], [], options).ok, false);
  const failed = { ...source, extraction_qa: { ...source.extraction_qa, can_generate_longform: false } };
  assert.equal(columnArtworkReadiness(column, [failed], [], options).ok, false);
  const short = { ...column, expertLensFull: { finalArticleBody: 'A short unsupported draft.' } };
  assert.equal(columnArtworkReadiness(short, [source], [], options).ok, false);
  const unlinked = { ...column, sources: [{ url: 'https://example.com/other' }] };
  assert.equal(columnArtworkReadiness(unlinked, [source], [], options).ok, false);
  const supporting = { ...source, id: 'supporting', sourceUrl: 'https://example.com/supporting', extraction_artifact: { ...source.extraction_artifact, source_url: 'https://example.com/supporting' } };
  const missingAttribution = { ...column, based_on_article_ids: [source.id, supporting.id] };
  assert.ok(columnArtworkReadiness(missingAttribution, [source, supporting], [], options).reasons.includes('source_links_do_not_match_evidence'));
});

test('a blocked first column never consumes the batch limit or hides pending work', () => {
  const first = { ...artworkColumn(), id: 'blocked', publishedAt: '2026-08-10' };
  const next = { ...artworkColumn(), id: 'ready', publishedAt: '2026-08-09' };
  const readiness = { blocked: { ok: false, reasons: ['source_unavailable'] }, ready: { ok: true } };
  const queue = prepareCodexImageQueue([first, next], {}, { limit: 1, readiness });
  assert.deepEqual(queue.jobs.map(job => job.id), ['ready']);
  assert.equal(queue.pendingCount, 2);
  assert.equal(queue.readyCount, 1);
  assert.deepEqual(queue.blocked[0].reasons, ['source_unavailable']);
  assert.equal(queue.blocked[0].importArgs, undefined);
  assert.equal(prepareCodexImageQueue([first], {}, { readiness: { blocked: { ok: false } } }).jobs.length, 0);
  const done = prepareCodexImageQueue([first, next], { ready: { state: 'valid' } }, { readiness });
  assert.deepEqual(done.jobs, []);
  assert.equal(done.pendingCount, 1);
  assert.equal(done.blocked.length, 1);
  const deferred = prepareCodexImageQueue([next], {}, { excludeIds: ['ready'] });
  assert.equal(deferred.jobs.length, 0);
  assert.equal(deferred.pendingCount, 1);
  assert.deepEqual(parseArgs(['--exclude-id', 'blocked', '--exclude-id', 'ready']).excludeIds, ['blocked', 'ready']);
});
