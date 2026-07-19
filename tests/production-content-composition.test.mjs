import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CONTENT_PIPELINE_VERSION,
  createProductionContentCycle,
} from '../src/adapters/content-cycle-composition.mjs';
import { expectedUpstreamReconciliationIdentity } from '../src/adapters/upstream-reconciliation-execution.mjs';
import { sourceCandidateFromUpstream } from '../scripts/lib/upstream-content-reconciliation.mjs';

const expectedPhases = [
  'ingest',
  'extract',
  'classify',
  'cluster',
  'generate',
  'review',
  'publish',
];

test('production composition registers exactly one ordered provider per canonical phase', () => {
  const { registry } = createProductionContentCycle();
  const description = registry.describe();

  assert.equal(CONTENT_PIPELINE_VERSION, '5.6.2');
  assert.deepEqual(
    description.capabilities.map(({ capability }) => capability).sort(),
    expectedPhases.map((phase) => `content.${phase}`).sort(),
  );
  assert.deepEqual(
    description.dependencyOrder,
    expectedPhases.map((phase) => `computecurrent.production-${phase}`),
  );
});

test('production providers stay outside the core orchestrator boundary', () => {
  const coreSource = fs.readFileSync(
    new URL('../src/core/orchestrator/content-cycle-orchestrator.mjs', import.meta.url),
    'utf8',
  );
  const compositionSource = fs.readFileSync(
    new URL('../src/adapters/content-cycle-composition.mjs', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(coreSource, /scripts\/|production-content-phases|production-content-plugins/);
  assert.match(compositionSource, /PRODUCTION_CONTENT_PLUGINS/);
  assert.match(compositionSource, /FileCycleCheckpointStore/);
});

test('production composition exposes injected checkpoint and publication receipt stores', () => {
  const checkpointStore = {
    load: async () => null,
    save: async () => {},
  };
  const publicationReceiptStore = {
    load: async () => ({ publicationReceipts: {} }),
    save: async () => {},
  };
  const publicationOutputBundleStore = {
    capture: async () => ({}),
    verifyAndRestore: async () => ({ ok: true }),
  };
  const composition = createProductionContentCycle({
    checkpointStore,
    publicationOutputBundleStore,
    publicationReceiptStore,
  });

  assert.equal(composition.checkpointStore, checkpointStore);
  assert.equal(composition.publicationReceiptStore, publicationReceiptStore);
  assert.equal(composition.publicationOutputBundleStore, publicationOutputBundleStore);
  assert.equal(composition.orchestrator.checkpointStore, checkpointStore);
});

test('completed reconciliation output requires a matching durable receipt identity', async () => {
  let bundleVerifications = 0;
  const checkpointIdentity = {
    kind: 'upstream-reconciliation',
    revision: 'a'.repeat(40),
    fingerprint: 'b'.repeat(64),
  };
  const { orchestrator } = createProductionContentCycle({
    checkpointStore: { load: async () => null, save: async () => {} },
    publicationReceiptStore: {
      load: async () => ({
        publicationReceipts: {
          'reconciliation-run': {
            runId: 'reconciliation-run',
            pipelineVersion: CONTENT_PIPELINE_VERSION,
            executionIdentity: { ...checkpointIdentity, fingerprint: 'c'.repeat(64) },
            status: 'completed',
            result: { outputManifest: { runId: 'reconciliation-run' } },
          },
        },
      }),
      save: async () => {},
    },
    publicationOutputBundleStore: {
      capture: async () => ({}),
      verifyAndRestore: async () => { bundleVerifications += 1; return { ok: true }; },
    },
  });

  await assert.rejects(
    () => orchestrator.verifyCompletedRun({
      runId: 'reconciliation-run',
      pipelineVersion: CONTENT_PIPELINE_VERSION,
      executionIdentity: checkpointIdentity,
    }),
    /completed_publication_receipt_missing/,
  );
  assert.equal(bundleVerifications, 0);
});

test('production composition rejects unbound or mismatched reconciliation before checkpoint access', async () => {
  let checkpointLoads = 0;
  let checkpointSaves = 0;
  const checkpointStore = {
    load: async () => { checkpointLoads += 1; return null; },
    save: async () => { checkpointSaves += 1; },
  };
  const composition = createProductionContentCycle({
    checkpointStore,
    publicationReceiptStore: {
      load: async () => ({ publicationReceipts: {} }),
      save: async () => {},
    },
    publicationOutputBundleStore: {
      capture: async () => ({}),
      verifyAndRestore: async () => ({ ok: true }),
    },
  });
  const input = {
    reconciliationCandidates: [sourceCandidateFromUpstream({
      title: 'A source title',
      source: 'Source',
      url: 'https://example.com/story',
      publishedAt: '2026-07-18T00:00:00.000Z',
      snippet: '',
    })],
    reconciliationRevision: 'a'.repeat(40),
  };
  const identity = expectedUpstreamReconciliationIdentity(input);

  await assert.rejects(
    () => composition.orchestrator.runCycle({ production: true, input }),
    /payload and execution identity must be provided together/,
  );
  await assert.rejects(
    () => composition.orchestrator.runCycle({
      production: true,
      input,
      executionIdentity: { ...identity, revision: 'b'.repeat(40) },
    }),
    /does not match its source candidates/,
  );
  await assert.rejects(
    () => composition.orchestrator.runCycle({
      production: true,
      input,
      executionIdentity: { ...identity, fingerprint: '0'.repeat(64) },
    }),
    /does not match its source candidates/,
  );
  await assert.rejects(
    () => composition.orchestrator.runCycle({
      production: true,
      input: {
        ...input,
        reconciliationCandidates: [{
          ...input.reconciliationCandidates[0],
          articleText: 'Generated copy must not cross this boundary.',
        }],
      },
      executionIdentity: identity,
    }),
    /canonical source discovery fields/,
  );
  await assert.rejects(
    () => composition.orchestrator.runCycle({
      production: true,
      input: {
        ...input,
        reconciliationCandidates: Array.from(
          { length: 31 },
          (_, index) => ({
            ...input.reconciliationCandidates[0],
            id: sourceCandidateFromUpstream({
              title: 'A source title',
              source: 'Source',
              url: `https://example.com/story/${index}`,
              publishedAt: '2026-07-18T00:00:00.000Z',
              snippet: '',
            }).id,
            url: `https://example.com/story/${index}`,
          }),
        ),
      },
      executionIdentity: identity,
    }),
    /accepts at most 30 candidates/,
  );
  await assert.rejects(
    () => composition.orchestrator.runCycle({
      production: true,
      input: {},
      executionIdentity: identity,
    }),
    /payload and execution identity must be provided together/,
  );
  for (const malformedCandidate of [
    { ...input.reconciliationCandidates[0], id: '   ' },
    { ...input.reconciliationCandidates[0], title: '<b>A source title</b>' },
    { ...input.reconciliationCandidates[0], publishedAt: '2026-07-18' },
    { ...input.reconciliationCandidates[0], url: 'https://example.com/story?utm_source=feed' },
    { ...input.reconciliationCandidates[0], title: 'Fish &amp; Chips' },
    { ...input.reconciliationCandidates[0], title: 'bye end' },
  ]) {
    await assert.rejects(
      () => composition.orchestrator.runCycle({
        production: true,
        input: { ...input, reconciliationCandidates: [malformedCandidate] },
        executionIdentity: identity,
      }),
      /canonical source discovery fields/,
    );
  }

  assert.equal(checkpointLoads, 0);
  assert.equal(checkpointSaves, 0);
});
