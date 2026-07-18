import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginContractError, validatePluginManifest } from '../src/core/contracts/index.mjs';
import { PluginRegistry, PluginRegistryError } from '../src/core/registry/index.mjs';

function plugin(id, capabilities, options = {}) {
  return {
    manifest: {
      id,
      version: options.version ?? '1.0.0',
      capabilities,
      configSchema: options.configSchema ?? { type: 'object', additionalProperties: false },
      dependencies: options.dependencies ?? [],
      enabled: options.enabled ?? true,
      migrationVersion: options.migrationVersion ?? 1,
      healthCheck: options.healthCheck ?? (async () => ({ ok: true })),
    },
    create: options.create ?? (() => ({ id })),
  };
}

test('plugin manifest validation fails closed on malformed identity, version, and duplicates', () => {
  assert.throws(() => validatePluginManifest({}), PluginContractError);
  assert.throws(() => validatePluginManifest(plugin('RSS', ['source']).manifest), /namespaced/);
  assert.throws(() => validatePluginManifest(plugin('source.rss', ['source'], { version: 'latest' }).manifest), /semantic/);
  assert.throws(() => validatePluginManifest(plugin('source.rss', ['source', 'source']).manifest), /unique/);

  const manifest = validatePluginManifest(plugin('source.rss', ['source.discovery'], { version: '1.2.3-beta.1' }).manifest);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(manifest.id, 'source.rss');
});

test('registry resolution and descriptions are deterministic across registration order', () => {
  const source = plugin('source.rss', ['source.discovery']);
  const extract = plugin('extract.readability', ['source.extract'], {
    dependencies: [{ capability: 'source.discovery' }],
  });
  const first = new PluginRegistry().register(extract).register(source);
  const second = new PluginRegistry().register(source).register(extract);

  assert.deepEqual(first.describe(), second.describe());
  assert.deepEqual(first.dependencyOrder(), ['source.rss', 'extract.readability']);
  assert.equal(first.resolve('source.extract').manifest.id, 'extract.readability');
});

test('registry rejects missing dependencies, ambiguous capabilities, and cycles', () => {
  const missing = new PluginRegistry().register(plugin('extract.readability', ['source.extract'], {
    dependencies: [{ capability: 'source.discovery' }],
  }));
  assert.throws(() => missing.validate(), (error) => error instanceof PluginRegistryError && error.code === 'missing_dependency');

  const ambiguous = new PluginRegistry()
    .register(plugin('image.alpha', ['image.generate']))
    .register(plugin('image.beta', ['image.generate']));
  assert.throws(() => ambiguous.validate(), (error) => error.code === 'ambiguous_capability');

  const cyclic = new PluginRegistry()
    .register(plugin('cycle.alpha', ['cycle.a'], { dependencies: [{ capability: 'cycle.b' }] }))
    .register(plugin('cycle.beta', ['cycle.b'], { dependencies: [{ capability: 'cycle.a' }] }));
  assert.throws(() => cyclic.validate(), (error) => error.code === 'dependency_cycle');
});

test('priority policy resolves a singleton capability independently of registration order', () => {
  const registry = new PluginRegistry({ priorityPolicy: { 'image.generate': ['image.beta', 'image.alpha'] } })
    .register(plugin('image.alpha', ['image.generate']))
    .register(plugin('image.beta', ['image.generate']));

  assert.equal(registry.resolve('image.generate').manifest.id, 'image.beta');
  assert.equal(registry.resolve('image.generate', 'image.alpha').manifest.id, 'image.alpha');
  assert.equal(registry.describe().capabilities[0].providerId, 'image.beta');
});

test('configuration is validated before a provider factory runs and instances are cached', async () => {
  let creates = 0;
  const registry = new PluginRegistry().register(plugin('source.rss', ['source.discovery'], {
    configSchema: {
      type: 'object',
      required: ['limit'],
      properties: { limit: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
    create: ({ config }) => {
      creates += 1;
      return {
        limit: config.limit,
        discover: async () => ({ ok: true, value: [] }),
        checkpoint: async () => ({ ok: true }),
      };
    },
  }), { config: { limit: 20 } });

  assert.equal((await registry.instantiate('source.discovery')).limit, 20);
  assert.equal((await registry.instantiate('source.discovery')).limit, 20);
  assert.equal(creates, 1);

  const invalid = new PluginRegistry().register(plugin('source.atom', ['source.discovery'], {
    configSchema: { type: 'object', required: ['limit'], properties: { limit: { type: 'integer' } } },
  }));
  await assert.rejects(() => invalid.instantiate('source.discovery'), /config.limit is required/);
});

test('health aggregation is sorted, sanitized, and reflects degraded and failed checks', async () => {
  const registry = new PluginRegistry()
    .register(plugin('source.zeta', ['source.discovery'], { healthCheck: async () => ({ status: 'degraded', code: 'slow', secret: 'never-return' }) }))
    .register(plugin('extract.alpha', ['source.extract'], { healthCheck: async () => { throw new Error('token=secret'); } }));

  const health = await registry.health();
  assert.equal(health.ok, false);
  assert.equal(health.status, 'unhealthy');
  assert.deepEqual(health.plugins.map(({ id }) => id), ['extract.alpha', 'source.zeta']);
  assert.deepEqual(health.plugins[0], { id: 'extract.alpha', version: '1.0.0', status: 'unhealthy', code: 'health_check_failed' });
  assert.equal(JSON.stringify(health).includes('secret'), false);
});
