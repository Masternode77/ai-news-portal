import { PluginContractError } from './plugin-manifest.mjs';

function contract(name, capabilities, methods) {
  return Object.freeze({
    name,
    capabilities: Object.freeze(capabilities),
    methods: Object.freeze(methods),
  });
}

export const PROVIDER_CONTRACTS = Object.freeze([
  contract('SourceConnector', ['source.discovery', 'source.connector'], ['discover', 'checkpoint']),
  contract('SourceExtractor', ['source.extract', 'source.extractor'], ['supports', 'extract']),
  contract('RelevanceProvider', ['editorial.relevance', 'relevance.classify'], ['classify']),
  contract('TaxonomyProvider', ['editorial.taxonomy', 'taxonomy.classify'], ['classify']),
  contract('EntityProvider', ['editorial.entities', 'editorial.entity', 'entity.extract'], ['extract']),
  contract('ClusterProvider', ['editorial.cluster', 'cluster.assign'], ['assign']),
  contract('EditorialWriter', ['editorial.write', 'editorial.writer'], ['evidence', 'angle', 'outline', 'draft']),
  contract('EditorialReviewer', ['editorial.review', 'editorial.reviewer'], ['critique', 'rewrite', 'diversity']),
  contract('SourceFidelityProvider', ['source.fidelity', 'editorial.fidelity'], ['verify']),
  contract('StorageAdapter', ['storage.adapter', 'storage.article'], ['transaction', 'getArticle', 'transition', 'appendRevision', 'queryPublic']),
  contract('ImageProvider', ['image.generate', 'image.provider'], ['generate', 'healthCheck']),
  contract('AuthProvider', ['auth.provider', 'auth.admin'], ['authenticate', 'authorize', 'createSession', 'revokeSession']),
  contract('PublishAdapter', ['publish.adapter', 'publication.publish'], ['publish', 'unpublish', 'rebuildReadModel']),
  contract('AnalyticsProvider', ['analytics.record', 'analytics.provider'], ['record']),
  contract('NotificationProvider', ['notification.notify', 'notification.provider'], ['notify']),
  contract('PhaseProvider', [
    'source.fetch',
    'content.ingest',
    'content.extract',
    'content.classify',
    'content.cluster',
    'content.generate',
    'content.review',
    'content.publish',
  ], ['run']),
]);

const CONTRACT_BY_CAPABILITY = new Map(PROVIDER_CONTRACTS.flatMap((definition) => (
  definition.capabilities.map((capability) => [capability, definition])
)));

function isProviderInstance(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function') && !Array.isArray(value);
}

export function validateProviderCapabilities(capabilities, { providerId = 'plugin' } = {}) {
  const unknownCapabilities = capabilities.filter((capability) => !CONTRACT_BY_CAPABILITY.has(capability));
  if (unknownCapabilities.length > 0) {
    throw new PluginContractError(
      `${providerId} declares capabilities without an instance contract: ${unknownCapabilities.join(', ')}`,
      'unknown_provider_capability',
    );
  }
  return [...new Set(capabilities.map((capability) => CONTRACT_BY_CAPABILITY.get(capability)))];
}

export function validateProviderInstance(instance, capabilities, { providerId = 'plugin' } = {}) {
  const definitions = validateProviderCapabilities(capabilities, { providerId });

  if (!isProviderInstance(instance)) {
    throw new PluginContractError(`${providerId} factory must return a provider instance`, 'invalid_provider_instance');
  }

  for (const definition of definitions) {
    for (const method of definition.methods) {
      if (typeof instance[method] !== 'function') {
        throw new PluginContractError(
          `${providerId} does not implement ${definition.name}.${method}()`,
          'invalid_provider_instance',
        );
      }
    }
  }
  return instance;
}
