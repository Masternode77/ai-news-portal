import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PluginContractError,
  PROVIDER_CONTRACTS,
  validateProviderInstance,
} from '../src/core/contracts/index.mjs';
import { PluginRegistry } from '../src/core/registry/index.mjs';
import { PRODUCTION_CONTENT_PLUGINS } from '../src/plugins/content/production-content-plugins.mjs';

function plugin(id, capability, create) {
  return {
    manifest: {
      id,
      version: '1.0.0',
      capabilities: [capability],
      configSchema: { type: 'object', additionalProperties: false },
      dependencies: [],
      enabled: true,
      migrationVersion: 1,
      healthCheck: async () => ({ ok: true }),
    },
    create,
  };
}

function validInstance(methods) {
  return Object.fromEntries(methods.map((method) => [method, () => undefined]));
}

test('all named provider contracts accept complete instances and reject every missing operation', () => {
  assert.equal(PROVIDER_CONTRACTS.length, 16);

  for (const definition of PROVIDER_CONTRACTS) {
    const capability = definition.capabilities[0];
    const complete = validInstance(definition.methods);
    assert.equal(validateProviderInstance(complete, [capability], { providerId: 'test.provider' }), complete);

    for (const missingMethod of definition.methods) {
      const malformed = validInstance(definition.methods.filter((method) => method !== missingMethod));
      assert.throws(
        () => validateProviderInstance(malformed, [capability], { providerId: 'test.provider' }),
        (error) => error instanceof PluginContractError
          && error.code === 'invalid_provider_instance'
          && error.message.includes(`${definition.name}.${missingMethod}()`),
      );
    }
  }
});

test('registry rejects a malformed source.extract factory result and does not cache it', async () => {
  let creates = 0;
  const registry = new PluginRegistry().register(plugin('source.broken-extractor', 'source.extract', () => {
    creates += 1;
    return {};
  }));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      () => registry.instantiate('source.extract'),
      (error) => error instanceof PluginContractError
        && error.code === 'invalid_provider_instance'
        && /SourceExtractor\.supports\(\)/.test(error.message),
    );
  }
  assert.equal(creates, 2);
});

test('registry accepts a complete source.extract provider instance', async () => {
  const instance = {
    supports: () => true,
    extract: async () => ({ ok: true, value: {} }),
  };
  const registry = new PluginRegistry().register(plugin('source.valid-extractor', 'source.extract', () => instance));

  assert.equal(await registry.instantiate('source.extract'), instance);
});

test('current content phase providers satisfy the explicit run-provider contract', async () => {
  const registry = new PluginRegistry();
  for (const currentPlugin of PRODUCTION_CONTENT_PLUGINS) registry.register(currentPlugin);

  for (const phase of ['ingest', 'extract', 'classify', 'cluster', 'generate', 'review', 'publish']) {
    const instance = await registry.instantiate(`content.${phase}`);
    assert.equal(typeof instance.run, 'function');
  }
});

test('registry rejects misspelled or unregistered capabilities before caching a factory result', async () => {
  let creates = 0;
  const registry = new PluginRegistry().register(plugin('source.misspelled', 'source.extrcat', () => {
    creates += 1;
    return {};
  }));

  await assert.rejects(
    () => registry.instantiate('source.extrcat'),
    (error) => error instanceof PluginContractError
      && error.code === 'unknown_provider_capability'
      && error.message.includes('source.extrcat'),
  );
  assert.equal(creates, 0);
});

test('production content factories fail closed when their run operation is missing', async () => {
  const broken = {
    ...PRODUCTION_CONTENT_PLUGINS[0],
    create: () => ({}),
  };
  const registry = new PluginRegistry().register(broken);

  await assert.rejects(
    () => registry.instantiate('content.ingest'),
    (error) => error instanceof PluginContractError
      && error.code === 'invalid_provider_instance'
      && /PhaseProvider\.run\(\)/.test(error.message),
  );
});
