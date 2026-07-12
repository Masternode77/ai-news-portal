import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CONTENT_PIPELINE_VERSION,
  createProductionContentCycle,
} from '../src/adapters/content-cycle-composition.mjs';

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

  assert.equal(CONTENT_PIPELINE_VERSION, '5.6.1');
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
