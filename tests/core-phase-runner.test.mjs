import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createPhaseRunner, ORCHESTRATOR_PHASES, PhaseRunnerError } from '../src/core/orchestrator/index.mjs';
import { PluginRegistry } from '../src/core/registry/index.mjs';
import { InMemoryStateStorage } from '../src/core/state/index.mjs';

function phasePlugin(run, { onCreate } = {}) {
  return {
    manifest: {
      id: 'source.test-fetch',
      version: '1.4.0',
      capabilities: ['source.fetch'],
      configSchema: { type: 'object', additionalProperties: false },
      dependencies: [],
      enabled: true,
      migrationVersion: 1,
      healthCheck: async () => ({ ok: true }),
    },
    create: () => {
      onCreate?.();
      return { run };
    },
  };
}

function request(overrides = {}) {
  return {
    phase: 'ingest',
    articleId: 'article-1',
    capability: 'source.fetch',
    input: { url: 'https://example.com/power' },
    fromState: 'discovered',
    toState: 'fetched',
    actor: { type: 'service', id: 'content-cycle' },
    reason: { code: 'source_fetched', detail: 'The source fetch completed within policy.' },
    pipelineVersion: '5.6.0',
    sourceVersion: 'etag-1',
    expectedArticleVersion: 0,
    idempotencyKey: 'cycle-1:ingest:article-1',
    correlationId: 'correlation-1',
    ...overrides,
  };
}

async function setup(run, state = 'discovered', pluginOptions) {
  let transitionId = 0;
  const registry = new PluginRegistry().register(phasePlugin(run, pluginOptions));
  const storage = new InMemoryStateStorage({
    clock: () => new Date('2026-07-11T00:00:00.000Z'),
    idGenerator: () => `transition-${++transitionId}`,
  });
  await storage.insertArticle({ id: 'article-1', state, version: 0 });
  return { runner: createPhaseRunner({ registry, storage }), storage };
}

test('phase runner exposes only canonical named phases', () => {
  assert.deepEqual(ORCHESTRATOR_PHASES, ['ingest', 'extract', 'classify', 'cluster', 'generate', 'review', 'publish', 'read-model']);
});

test('phase runner resolves a provider from the registry and commits its legal transition', async () => {
  const seen = [];
  const { runner, storage } = await setup(async (input, context) => {
    seen.push({ input, context });
    return { ok: true, value: { status: 200 } };
  });

  const result = await runner.run(request());
  assert.equal(result.ok, true);
  assert.equal(result.provider.id, 'source.test-fetch');
  assert.equal(result.transition.toState, 'fetched');
  assert.equal(result.transition.articleVersion, 1);
  assert.equal(seen[0].context.phase, 'ingest');
  assert.equal((await storage.getArticle('article-1')).state, 'fetched');
});

test('same-key concurrent phase requests execute once and replay the committed response', async () => {
  let calls = 0;
  const { runner, storage } = await setup(async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { ok: true, value: { fetched: true } };
  });

  const [first, second] = await Promise.all([runner.run(request()), runner.run(request())]);
  assert.equal(calls, 1);
  assert.deepEqual([first.replayed, second.replayed].sort(), [false, true]);
  assert.equal((await storage.listTransitions()).length, 1);

  await assert.rejects(
    () => runner.run(request({ input: { url: 'https://example.com/different' } })),
    (error) => error instanceof PhaseRunnerError && error.code === 'idempotency_conflict',
  );
});

test('illegal transitions fail before the provider operation executes', async () => {
  let calls = 0;
  let creates = 0;
  const { runner, storage } = await setup(
    async () => { calls += 1; return { ok: true }; },
    'published',
    { onCreate: () => { creates += 1; } },
  );

  await assert.rejects(() => runner.run(request({ fromState: 'published' })), /illegal lifecycle transition/);
  assert.equal(creates, 0);
  assert.equal(calls, 0);
  assert.equal((await storage.getArticle('article-1')).state, 'published');
  assert.deepEqual(await storage.listTransitions(), []);
});

test('provider exceptions roll back state and leave the idempotency key retryable', async () => {
  let calls = 0;
  const { runner, storage } = await setup(async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary failure');
    return { ok: true, value: { fetched: true } };
  });

  await assert.rejects(() => runner.run(request()), /temporary failure/);
  assert.equal((await storage.getArticle('article-1')).state, 'discovered');
  assert.deepEqual(await storage.listTransitions(), []);

  const retry = await runner.run(request());
  assert.equal(retry.ok, true);
  assert.equal(calls, 2);
});

test('typed provider failure is idempotent and does not transition article state', async () => {
  let calls = 0;
  const { runner, storage } = await setup(async () => {
    calls += 1;
    return { ok: false, error: { code: 'source_timeout' }, retryable: true };
  });

  const first = await runner.run(request());
  const replay = await runner.run(request());
  assert.equal(first.ok, false);
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
  assert.equal((await storage.getArticle('article-1')).state, 'discovered');
  assert.deepEqual(await storage.listTransitions(), []);
});

test('phase runner honors the storage restore target for soft-deleted articles', async () => {
  const { runner, storage } = await setup(async () => ({ ok: true }), 'published');
  await storage.transition({
    articleId: 'article-1',
    toState: 'deleted',
    actor: { type: 'user', id: 'admin' },
    reason: { code: 'admin_soft_delete', detail: 'The editor removed this item from public discovery.' },
    pipelineVersion: '5.6.0',
    sourceVersion: 'etag-1',
    idempotencyKey: 'delete-article-1',
    correlationId: 'correlation-delete',
  });

  const result = await runner.run(request({
    fromState: 'deleted',
    toState: 'published',
    expectedArticleVersion: 1,
    idempotencyKey: 'restore-article-1',
    correlationId: 'correlation-restore',
  }));

  assert.equal(result.ok, true);
  assert.equal((await storage.getArticle('article-1')).state, 'published');
});

test('orchestrator source imports core state only and contains no provider implementation imports', () => {
  const source = fs.readFileSync(new URL('../src/core/orchestrator/phase-runner.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('/plugins/'), false);
  assert.equal(source.includes('scripts/lib'), false);
  assert.match(source, /from '\.\.\/state\/lifecycle\.mjs'/);
});
