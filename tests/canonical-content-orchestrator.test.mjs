import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PluginRegistry } from '../src/core/registry/index.mjs';
import {
  CONTENT_CYCLE_PHASES,
  ContentCycleError,
  createContentCycleOrchestrator,
} from '../src/core/orchestrator/index.mjs';
import {
  FileCycleCheckpointError,
  FileCycleCheckpointStore,
} from '../src/core/state/index.mjs';

const CAPABILITIES = Object.freeze(Object.fromEntries(
  CONTENT_CYCLE_PHASES.map((phase) => [phase, `content.${phase}`]),
));

function providerPlugin(phase, calls, implementation = null) {
  return {
    manifest: {
      id: `test.${phase}`,
      version: '1.0.0',
      capabilities: [CAPABILITIES[phase]],
      configSchema: { type: 'object', additionalProperties: false },
      dependencies: [],
      enabled: true,
      migrationVersion: 1,
      healthCheck: async () => ({ ok: true }),
    },
    create: () => ({
      run: async (payload, context) => {
        calls.push({ phase, runId: context.runId, payload: structuredClone(payload) });
        if (implementation) return implementation(payload, context);
        const article = payload.items?.[0] || { id: 'article-1', title: 'Grid capacity expands' };
        const stateByPhase = {
          ingest: ['discovered', 'fetched'],
          extract: ['fetched', 'extracted'],
          classify: ['extracted', 'clean_source'],
          cluster: ['clean_source', 'editorial_candidate'],
          generate: ['editorial_candidate', 'drafting'],
          review: ['drafting', 'publish_ready'],
          publish: ['publish_ready', 'published'],
        };
        const [fromState, toState] = stateByPhase[phase];
        return {
          ok: true,
          value: { ...payload, items: [article], visited: [...(payload.visited || []), phase] },
          discoveries: phase === 'ingest' ? [{ id: article.id, sourceVersion: 'fixture-v1' }] : [],
          transitions: [{
            articleId: article.id,
            fromState,
            toState,
            sourceVersion: 'fixture-v1',
            reason: { code: `${phase}_complete`, detail: `${phase} completed in the fixture provider.` },
          }],
        };
      },
    }),
  };
}

async function harness(overrides = {}, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-cycle-'));
  const checkpointStore = new FileCycleCheckpointStore(path.join(directory, 'checkpoint.json'));
  const calls = [];
  const registry = new PluginRegistry();
  for (const phase of CONTENT_CYCLE_PHASES) {
    registry.register(providerPlugin(phase, calls, overrides[phase]));
  }
  let id = 0;
  const orchestrator = createContentCycleOrchestrator({
    registry,
    checkpointStore,
    completedRunVerifier: options.completedRunVerifier,
    phaseCapabilities: CAPABILITIES,
    pipelineVersion: '5.6.0-test',
    clock: () => new Date('2026-07-12T00:00:00.000Z'),
    idGenerator: () => `record-${++id}`,
  });
  return { calls, checkpointStore, directory, orchestrator, registry };
}

test('canonical cycle executes registered providers in order and records complete lifecycle evidence', async (t) => {
  const { calls, checkpointStore, directory, orchestrator } = await harness();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const result = await orchestrator.runCycle({ production: true });
  const checkpoint = await checkpointStore.load();

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls.map(({ phase }) => phase), CONTENT_CYCLE_PHASES);
  assert.deepEqual(checkpoint.completedPhases, CONTENT_CYCLE_PHASES);
  assert.equal(checkpoint.lifecycle.articles['article-1'].state, 'published');
  assert.equal(checkpoint.lifecycle.articles['article-1'].version, 7);
  assert.equal(checkpoint.lifecycle.transitions.length, 7);
  assert.ok(checkpoint.lifecycle.transitions.every((record) => (
    record.actor.id === 'canonical-content-cycle'
      && record.pipelineVersion === '5.6.0-test'
      && record.idempotencyKey
      && record.correlationId === checkpoint.runId
  )));
});

test('a completed cycle must verify its durable outputs before a new run begins', async (t) => {
  let allowNextRun = false;
  const { calls, directory, orchestrator } = await harness({}, {
    completedRunVerifier: async () => (
      allowNextRun ? { ok: true, restored: [] } : { ok: false, code: 'output_manifest_mismatch' }
    ),
  });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await orchestrator.runCycle({ production: true });

  await assert.rejects(
    () => orchestrator.runCycle({ production: true }),
    (error) => error instanceof ContentCycleError && error.code === 'output_manifest_mismatch',
  );
  assert.equal(calls.length, CONTENT_CYCLE_PHASES.length);
  allowNextRun = true;
  await orchestrator.runCycle({ production: true });
  assert.equal(calls.length, CONTENT_CYCLE_PHASES.length * 2);
});

test('isolated phases require predecessor checkpoints and replay completed work without provider calls', async (t) => {
  const { calls, directory, orchestrator } = await harness();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    () => orchestrator.runPhase('extract'),
    (error) => error instanceof ContentCycleError && error.code === 'missing_checkpoint',
  );
  await orchestrator.runPhase('ingest');
  const replay = await orchestrator.runPhase('ingest');
  assert.equal(replay.replayed, true);
  assert.deepEqual(calls.map(({ phase }) => phase), ['ingest']);
  await orchestrator.runPhase('extract');
  await assert.rejects(
    () => orchestrator.runPhase('generate'),
    (error) => error instanceof ContentCycleError && error.code === 'phase_out_of_order',
  );
});

test('failed provider checkpoint resumes at the failed phase without replaying completed phases', async (t) => {
  let attempts = 0;
  const { calls, checkpointStore, directory, orchestrator } = await harness({
    classify: async (payload) => {
      attempts += 1;
      if (attempts === 1) return { ok: false, error: { code: 'temporary_classifier_failure' }, retryable: true };
      return {
        ok: true,
        value: { ...payload, visited: [...payload.visited, 'classify'] },
        transitions: [{
          articleId: 'article-1',
          fromState: 'extracted',
          toState: 'clean_source',
          sourceVersion: 'fixture-v1',
          reason: { code: 'classify_complete', detail: 'Classification succeeded after retry.' },
        }],
      };
    },
  });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await assert.rejects(() => orchestrator.runCycle({ production: true }), /temporary_classifier_failure/);
  assert.equal((await checkpointStore.load()).status, 'failed');
  const result = await orchestrator.runCycle({ production: true });
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls.map(({ phase }) => phase), [
    'ingest', 'extract', 'classify', 'classify', 'cluster', 'generate', 'review', 'publish',
  ]);
});

test('a checkpoint from a different pipeline version cannot be resumed', async (t) => {
  const { checkpointStore, directory, orchestrator, registry } = await harness();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await orchestrator.runPhase('ingest');

  const upgraded = createContentCycleOrchestrator({
    registry,
    checkpointStore,
    phaseCapabilities: CAPABILITIES,
    pipelineVersion: '5.7.0-test',
  });

  await assert.rejects(
    () => upgraded.runPhase('extract'),
    (error) => error instanceof ContentCycleError && error.code === 'checkpoint_version_mismatch',
  );
});

test('checkpoint storage rejects non-prefix phase histories and inconsistent receipts', async (t) => {
  const { checkpointStore, directory, orchestrator } = await harness();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await orchestrator.runPhase('ingest');
  const checkpoint = await checkpointStore.load();
  checkpoint.completedPhases = ['ingest', 'classify'];
  checkpoint.providerReceipts = checkpoint.providerReceipts.slice(0, 1);

  await fs.writeFile(checkpointStore.filePath, `${JSON.stringify(checkpoint)}\n`, 'utf8');
  await assert.rejects(
    () => checkpointStore.load(),
    (error) => error instanceof FileCycleCheckpointError && error.code === 'invalid_checkpoint',
  );
});

test('checkpoint storage rejects lifecycle snapshots that do not replay from the transition journal', async (t) => {
  const { checkpointStore, directory, orchestrator } = await harness();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await orchestrator.runPhase('ingest');
  const checkpoint = await checkpointStore.load();
  checkpoint.lifecycle.articles['article-1'].state = 'not_canonical';
  checkpoint.lifecycle.articles['article-1'].version = -99;

  await fs.writeFile(checkpointStore.filePath, `${JSON.stringify(checkpoint)}\n`, 'utf8');
  await assert.rejects(
    () => checkpointStore.load(),
    (error) => error instanceof FileCycleCheckpointError && error.code === 'invalid_checkpoint',
  );
});

test('provider transition contract failures persist a failed checkpoint', async (t) => {
  const { checkpointStore, directory, orchestrator } = await harness({
    extract: async (payload) => ({
      ok: true,
      value: payload,
      transitions: [{
        articleId: 'article-1',
        fromState: 'fetched',
        toState: 'published',
        sourceVersion: 'fixture-v1',
        reason: { code: 'illegal_skip', detail: 'This transition intentionally skips required states.' },
      }],
    }),
  });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await orchestrator.runPhase('ingest');

  await assert.rejects(() => orchestrator.runPhase('extract'), /provider contract validation/);
  const checkpoint = await checkpointStore.load();
  assert.equal(checkpoint.status, 'failed');
  assert.equal(checkpoint.failure.phase, 'extract');
  assert.equal(checkpoint.failure.code, 'illegal_transition');
});

test('core cycle orchestrator has no concrete provider or scripts imports', async () => {
  const source = await fs.readFile(
    new URL('../src/core/orchestrator/content-cycle-orchestrator.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('/plugins/'), false);
  assert.equal(source.includes('scripts/lib'), false);
});
