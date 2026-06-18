import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { maybePurgeCache } from '../scripts/verify-production-surface.mjs';
import { classifyQaQcVerdict, runQaQc } from '../scripts/run-qa-qc.mjs';

const passedLocalProduction = {
  localDist: { ok: true },
  live: { ok: true },
  staging: { skipped: false, ok: true },
  cachePurge: { status: 'purged' },
};

test('QA/QC verdict blocks on local or merge failures', () => {
  assert.equal(
    classifyQaQcVerdict({ localGateOk: false, mergeChecks: [], production: passedLocalProduction }).verdict,
    'blocked',
  );
  assert.equal(
    classifyQaQcVerdict({
      localGateOk: true,
      mergeChecks: [{ name: 'unmerged git paths', ok: false }],
      production: passedLocalProduction,
    }).verdict,
    'blocked',
  );
});

test('QA/QC verdict separates operational follow-up from local release blockers', () => {
  const result = classifyQaQcVerdict({
    localGateOk: true,
    mergeChecks: [{ name: 'unmerged git paths', ok: true }],
    production: {
      localDist: { ok: true },
      live: { ok: false },
      staging: { skipped: true, blocker: 'skipped staging step: URL not provided' },
      cachePurge: { status: 'skipped', blocker: 'cache purge skipped by QA/QC non-goal' },
    },
  });

  assert.equal(result.verdict, 'deployable with operational follow-up');
  assert.match(result.followUps.join('\n'), /cache purge skipped by QA\/QC non-goal/);
});

test('QA/QC verdict treats skipped content gate and failed staging as operational follow-up', () => {
  const skippedGate = classifyQaQcVerdict({
    localGateOk: true,
    localGateSkipped: true,
    mergeChecks: [{ name: 'unmerged git paths', ok: true }],
    production: passedLocalProduction,
  });
  assert.equal(skippedGate.verdict, 'deployable with operational follow-up');
  assert.match(skippedGate.followUps.join('\n'), /local content gate skipped/);

  const failedStaging = classifyQaQcVerdict({
    localGateOk: true,
    mergeChecks: [{ name: 'unmerged git paths', ok: true }],
    production: {
      localDist: { ok: true },
      live: { ok: true },
      staging: { ok: false, skipped: false },
      cachePurge: { status: 'purged' },
    },
  });
  assert.equal(failedStaging.verdict, 'deployable with operational follow-up');
  assert.match(failedStaging.followUps.join('\n'), /staging URL verification failed/);
});

test('QA/QC report does not present skipped content gate as passed', async (t) => {
  const reportPath = new URL('../evidence/qa-qc/test-skipped-gate-report.md', import.meta.url);
  const jsonPath = new URL('../evidence/qa-qc/test-skipped-gate-report.json', import.meta.url);

  t.after(async () => {
    await fs.promises.rm(reportPath, { force: true });
    await fs.promises.rm(jsonPath, { force: true });
  });

  await runQaQc({
    skipContentGate: true,
    skipLive: true,
    out: fileURLToPath(reportPath),
    json: fileURLToPath(jsonPath),
  });
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /`npm run content:gate` -> skipped/);
  assert.match(report, /Local gate: skipped \(prior gate evidence required\)/);
  assert.doesNotMatch(report, /Local gate: passed/);
});

test('cache purge is skipped by default and only runs with explicit opt-in', async (t) => {
  const previousUrl = process.env.COMPUTE_CURRENT_CACHE_PURGE_URL;
  const previousToken = process.env.COMPUTE_CURRENT_CACHE_PURGE_TOKEN;
  let postCount = 0;
  const server = http.createServer((request, response) => {
    postCount += request.method === 'POST' ? 1 : 0;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"ok":true}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (previousUrl === undefined) {
      delete process.env.COMPUTE_CURRENT_CACHE_PURGE_URL;
    } else {
      process.env.COMPUTE_CURRENT_CACHE_PURGE_URL = previousUrl;
    }
    if (previousToken === undefined) {
      delete process.env.COMPUTE_CURRENT_CACHE_PURGE_TOKEN;
    } else {
      process.env.COMPUTE_CURRENT_CACHE_PURGE_TOKEN = previousToken;
    }
    await new Promise((resolve) => server.close(resolve));
  });

  const { port } = server.address();
  process.env.COMPUTE_CURRENT_CACHE_PURGE_URL = `http://127.0.0.1:${port}/purge`;
  process.env.COMPUTE_CURRENT_CACHE_PURGE_TOKEN = 'test-token';

  const skipped = await maybePurgeCache();
  assert.equal(skipped.status, 'skipped');
  assert.match(skipped.blocker, /explicit --purge-cache opt-in/);
  assert.equal(postCount, 0);

  const purged = await maybePurgeCache({ purgeCache: true });
  assert.equal(purged.status, 'purged');
  assert.equal(postCount, 1);
});

test('QA/QC docs and package script expose the reusable workflow contract', () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const runbook = fs.readFileSync(new URL('../docs/qa-qc-runbook.md', import.meta.url), 'utf8');
  const verifier = fs.readFileSync(new URL('../scripts/verify-production-surface.mjs', import.meta.url), 'utf8');

  assert.equal(packageJson.scripts['qa:qc'], 'node ./scripts/run-qa-qc.mjs');
  assert.match(runbook, /deployable with operational follow-up/);
  assert.match(runbook, /Do not execute cache purge/);
  assert.match(verifier, /skipCachePurge/);
});
