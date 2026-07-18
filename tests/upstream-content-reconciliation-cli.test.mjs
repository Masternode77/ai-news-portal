import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  assertSafeRevision,
  buildAdvisoryReview,
  parseArgs,
} from '../scripts/audit-upstream-content-reconciliation.mjs';

const scriptPath = new URL('../scripts/audit-upstream-content-reconciliation.mjs', import.meta.url);
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('upstream audit CLI exposes a read-only package command', () => {
  assert.equal(
    packageJson.scripts['audit:upstream-content'],
    'node ./scripts/audit-upstream-content-reconciliation.mjs',
  );
  assert.doesNotMatch(scriptSource, /writeJsonFile|writeFileSync|fs\.writeFile|fs\.rename/);
  assert.doesNotMatch(scriptSource, /generatedImage|articleText|homepagePublished/);
});

test('upstream audit CLI parses bounded read-only arguments', () => {
  assert.deepEqual(parseArgs([]), {
    revision: 'origin/main',
    json: false,
    review: false,
    help: false,
  });
  assert.deepEqual(parseArgs(['--revision', 'refs/heads/main', '--json']), {
    revision: 'refs/heads/main',
    json: true,
    review: false,
    help: false,
  });
  assert.deepEqual(parseArgs(['--review']), {
    revision: 'origin/main',
    json: false,
    review: true,
    help: false,
  });
  assert.equal(assertSafeRevision('origin/main'), 'origin/main');
  assert.throws(() => assertSafeRevision('--upload-pack=sh'), /unsafe revision/);
  assert.throws(() => assertSafeRevision('main^{tree}'), /unsafe revision/);
  assert.throws(() => parseArgs(['--json', '--review']), /mutually exclusive/);
  assert.throws(() => parseArgs(['--unknown']), /unknown argument/);
});

test('upstream review is explicitly advisory and does not add generated fields', () => {
  const review = buildAdvisoryReview({
    resolvedRevision: 'abc123',
    candidates: [
      {
        id: 'grid',
        title: 'The Super-Grid Transformer Revolution Powering AI Data Centers',
        source: 'Example Grid Wire',
      },
      {
        id: 'consumer',
        title: 'Gaming laptop bundle saves buyers $100',
        source: 'Example Consumer Wire',
      },
    ],
  });

  assert.equal(review.authority, 'advisory_title_only');
  assert.match(review.warning, /Do not publish or permanently reject/);
  assert.equal(review.counts.core_lane, 1);
  assert.equal(review.counts.archive_only, 1);
  assert.deepEqual(review.rows.map(({ id, decision }) => ({ id, decision })), [
    { id: 'grid', decision: 'core_lane' },
    { id: 'consumer', decision: 'archive_only' },
  ]);
  assert.doesNotMatch(JSON.stringify(review), /articleText|generatedImage|homepagePublished/);
});

test('upstream audit CLI rejects mutation before reading git or content data', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(scriptPath), '--apply'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /apply mode is disabled/);
  assert.equal(result.stdout, '');
});

function fileURLToPath(url) {
  return decodeURIComponent(url.pathname);
}
