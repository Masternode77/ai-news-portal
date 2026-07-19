import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertExecutionBoundary,
  assertReconciliationProviderReadiness,
  parseArgs,
  runUpstreamReconciliation,
} from '../scripts/reconcile-upstream-content.mjs';
import { MAX_UPSTREAM_RECONCILIATION_CANDIDATES } from '../src/adapters/upstream-reconciliation-execution.mjs';
import { sourceCandidateFromUpstream } from '../scripts/lib/upstream-content-reconciliation.mjs';

const scriptUrl = new URL('../scripts/reconcile-upstream-content.mjs', import.meta.url);
const scriptSource = fs.readFileSync(scriptUrl, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function sourceCandidate(overrides = {}) {
  return sourceCandidateFromUpstream({
    title: 'A source title',
    source: 'Source',
    url: 'https://example.com/story',
    publishedAt: '2026-07-18T00:00:00.000Z',
    snippet: '',
    ...overrides,
  });
}

function providerEnv(overrides = {}) {
  return {
    IMAGE_PROVIDER: 'image2',
    OPENAI_API_KEY: 'test-only-image-key',
    OPENROUTER_API_KEY: 'test-only-editorial-key',
    ...overrides,
  };
}

test('upstream reconciliation execution is wired only to the canonical lifecycle', () => {
  assert.equal(
    packageJson.scripts['content:reconcile-upstream'],
    'node ./scripts/reconcile-upstream-content.mjs',
  );
  assert.match(scriptSource, /runCanonicalContentCommand/);
  assert.match(scriptSource, /cycleRunner\('cycle'/);
  assert.doesNotMatch(scriptSource, /writeJsonFile|writeFileSync|fs\.writeFile|fs\.rename/);
});

test('upstream reconciliation execution requires two explicit boundary flags', () => {
  assert.throws(() => assertExecutionBoundary(parseArgs([])), /both --execute and --production/);
  assert.throws(() => assertExecutionBoundary(parseArgs(['--execute'])), /both --execute and --production/);
  assert.doesNotThrow(() => assertExecutionBoundary(parseArgs(['--execute', '--production'])));

  const result = spawnSync(process.execPath, [fileURLToPath(scriptUrl), '--execute'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /both --execute and --production/);
  assert.equal(result.stdout, '');
});

test('upstream reconciliation requires online editorial and Image2 providers before state access', async () => {
  assert.throws(() => assertReconciliationProviderReadiness({}), /OPENROUTER_API_KEY/);
  assert.throws(
    () => assertReconciliationProviderReadiness(providerEnv({ OPENAI_API_KEY: '' })),
    /OPENAI_API_KEY/,
  );
  assert.throws(
    () => assertReconciliationProviderReadiness(providerEnv({ IMAGE_PROVIDER: 'local' })),
    /IMAGE_PROVIDER=image2/,
  );
  assert.throws(
    () => assertReconciliationProviderReadiness(providerEnv({ PIPELINE_OFFLINE: '1' })),
    /online provider access/,
  );
  assert.doesNotThrow(() => assertReconciliationProviderReadiness(providerEnv()));

  let stateAccesses = 0;
  await assert.rejects(
    () => runUpstreamReconciliation(
      { revision: 'origin/main', execute: true, production: true },
      {
        env: {},
        checkpointLoader: async () => { stateAccesses += 1; },
        auditRunner: async () => { stateAccesses += 1; },
        cycleRunner: async () => { stateAccesses += 1; },
      },
    ),
    /OPENROUTER_API_KEY/,
  );
  assert.equal(stateAccesses, 0);
});

test('upstream reconciliation passes only audited source candidates to one canonical cycle', async () => {
  const candidate = sourceCandidate({ snippet: 'Source snippet.' });
  const calls = [];
  const result = await runUpstreamReconciliation(
    { revision: 'origin/main', execute: true, production: true },
    {
      auditRunner: async () => ({
        revision: 'origin/main',
        resolvedRevision: 'b'.repeat(40),
        counts: { upstream: 1, alreadyPresent: 0, reingest: 1, rejected: 0 },
        candidates: [candidate],
      }),
      env: providerEnv(),
      checkpointLoader: async () => null,
      cycleRunner: async (...args) => {
        calls.push(args);
        return {
          status: 'completed',
          runId: 'run-1',
          executionIdentity: args[1].executionIdentity,
        };
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'cycle');
  assert.deepEqual(calls[0][1], {
    production: true,
    executionIdentity: {
      kind: 'upstream-reconciliation',
      revision: 'b'.repeat(40),
      fingerprint: calls[0][1].executionIdentity.fingerprint,
    },
    input: {
      reconciliationCandidates: [candidate],
      reconciliationRevision: 'b'.repeat(40),
    },
  });
  assert.match(calls[0][1].executionIdentity.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.receipt.runId, 'run-1');
});

test('upstream reconciliation rejects oversized audits before the canonical cycle is called', async () => {
  let cycleCalls = 0;
  const candidate = sourceCandidate();

  await assert.rejects(
    () => runUpstreamReconciliation(
      { revision: 'origin/main', execute: true, production: true },
      {
        auditRunner: async () => ({
          revision: 'origin/main',
          resolvedRevision: 'd'.repeat(40),
          counts: {
            upstream: MAX_UPSTREAM_RECONCILIATION_CANDIDATES + 1,
            alreadyPresent: 0,
            reingest: MAX_UPSTREAM_RECONCILIATION_CANDIDATES + 1,
            rejected: 0,
          },
          candidates: Array.from(
            { length: MAX_UPSTREAM_RECONCILIATION_CANDIDATES + 1 },
            (_, index) => sourceCandidate({ url: `${candidate.url}/${index}` }),
          ),
        }),
        env: providerEnv(),
        checkpointLoader: async () => null,
        cycleRunner: async () => { cycleCalls += 1; },
      },
    ),
    /accepts at most 30 candidates/,
  );

  assert.equal(cycleCalls, 0);
});

test('upstream reconciliation rejects a canonical receipt for a different audited input', async () => {
  await assert.rejects(
    () => runUpstreamReconciliation(
      { revision: 'origin/main', execute: true, production: true },
      {
        auditRunner: async () => ({
          revision: 'origin/main',
          resolvedRevision: 'e'.repeat(40),
          counts: { upstream: 1, alreadyPresent: 0, reingest: 1, rejected: 0 },
          candidates: [sourceCandidate()],
        }),
        env: providerEnv(),
        checkpointLoader: async () => null,
        cycleRunner: async () => ({
          status: 'completed',
          runId: 'wrong-run',
          executionIdentity: {
            kind: 'upstream-reconciliation',
            revision: 'f'.repeat(40),
            fingerprint: '0'.repeat(64),
          },
        }),
      },
    ),
    /receipt does not match the audited reconciliation input/,
  );
});

test('upstream reconciliation resumes its immutable checkpoint before a changed local audit', async () => {
  const resolvedRevision = '1'.repeat(40);
  const candidate = sourceCandidate();
  let checkpoint = null;
  let auditCalls = 0;
  let cycleCalls = 0;
  const options = {
    env: providerEnv(),
    checkpointLoader: async () => checkpoint,
    revisionResolver: async () => resolvedRevision,
    auditRunner: async () => {
      auditCalls += 1;
      return {
        revision: 'origin/main',
        resolvedRevision,
        counts: { upstream: 1, alreadyPresent: 0, reingest: 1, rejected: 0 },
        candidates: [candidate],
      };
    },
    cycleRunner: async (_command, cycleOptions) => {
      cycleCalls += 1;
      if (cycleCalls === 1) {
        checkpoint = {
          status: 'failed',
          executionIdentity: structuredClone(cycleOptions.executionIdentity),
          executionInput: structuredClone(cycleOptions.input),
        };
        throw new Error('publish output bundle failed after local projection changed');
      }
      return {
        status: 'completed',
        runId: 'resumed-run',
        executionIdentity: cycleOptions.executionIdentity,
      };
    },
  };

  await assert.rejects(
    () => runUpstreamReconciliation(
      { revision: 'origin/main', execute: true, production: true },
      options,
    ),
    /output bundle failed/,
  );
  const resumed = await runUpstreamReconciliation(
    { revision: 'origin/main', execute: true, production: true },
    options,
  );

  assert.equal(auditCalls, 1);
  assert.equal(cycleCalls, 2);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.receipt.runId, 'resumed-run');
});

test('upstream reconciliation performs no cycle for an empty current audit', async () => {
  let cycleCalls = 0;
  let verificationCalls = 0;
  const result = await runUpstreamReconciliation(
    { revision: 'origin/main', execute: true, production: true },
    {
      auditRunner: async () => ({
        revision: 'origin/main',
        resolvedRevision: 'c'.repeat(40),
        counts: { upstream: 0, alreadyPresent: 0, reingest: 0, rejected: 0 },
        candidates: [],
      }),
      env: providerEnv(),
      checkpointLoader: async () => null,
      completedCheckpointVerifier: async () => {
        verificationCalls += 1;
        return { status: 'completed', runId: 'prior-run', restored: [] };
      },
      cycleRunner: async () => { cycleCalls += 1; },
    },
  );

  assert.equal(cycleCalls, 0);
  assert.equal(verificationCalls, 1);
  assert.equal(result.outputVerification.status, 'completed');
  assert.equal(result.receipt, null);
});
