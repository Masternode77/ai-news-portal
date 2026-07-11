import {
  isCapability,
  validatePlugin,
  validatePluginConfig,
} from '../contracts/plugin-manifest.mjs';

export class PluginRegistryError extends Error {
  constructor(message, code = 'plugin_registry_error') {
    super(message);
    this.name = 'PluginRegistryError';
    this.code = code;
  }
}

function selectorId(selector) {
  if (typeof selector === 'string') return selector;
  if (selector && typeof selector === 'object') return selector.id ?? selector.pluginId ?? null;
  return null;
}

function normalizePriorityPolicy(policy) {
  const entries = policy instanceof Map ? [...policy.entries()] : Object.entries(policy ?? {});
  return new Map(entries.map(([capability, value]) => [
    capability,
    Object.freeze((Array.isArray(value) ? value : [value]).filter(Boolean)),
  ]));
}

function healthStatus(result) {
  if (result?.status === 'healthy' || result?.status === 'degraded' || result?.status === 'unhealthy') return result.status;
  return result?.ok === false ? 'unhealthy' : 'healthy';
}

export class PluginRegistry {
  #registrations = new Map();
  #instances = new Map();
  #priorityPolicy;
  #pluginContext;

  constructor({ priorityPolicy = {}, pluginContext = {} } = {}) {
    this.#priorityPolicy = normalizePriorityPolicy(priorityPolicy);
    this.#pluginContext = pluginContext;
  }

  register(plugin, { config = {} } = {}) {
    const validated = validatePlugin(plugin);
    if (this.#registrations.has(validated.manifest.id)) {
      throw new PluginRegistryError(`plugin ${validated.manifest.id} is already registered`, 'duplicate_plugin_id');
    }
    this.#registrations.set(validated.manifest.id, { plugin: validated, config: structuredClone(config) });
    return this;
  }

  #providers(capability) {
    return [...this.#registrations.values()]
      .filter(({ plugin }) => plugin.manifest.enabled && plugin.manifest.capabilities.includes(capability))
      .sort((a, b) => a.plugin.manifest.id.localeCompare(b.plugin.manifest.id));
  }

  #selectRegistration(capability, selector) {
    if (!isCapability(capability)) throw new PluginRegistryError(`invalid capability ${String(capability)}`, 'invalid_capability');
    const providers = this.#providers(capability);
    if (providers.length === 0) throw new PluginRegistryError(`no enabled provider for ${capability}`, 'missing_capability');

    const requestedId = selectorId(selector);
    if (requestedId) {
      const selected = providers.find(({ plugin }) => plugin.manifest.id === requestedId);
      if (!selected) throw new PluginRegistryError(`plugin ${requestedId} does not provide ${capability}`, 'selector_not_found');
      return selected;
    }
    if (providers.length === 1) return providers[0];

    const priority = this.#priorityPolicy.get(capability) ?? [];
    const selectedId = priority.find((id) => providers.some(({ plugin }) => plugin.manifest.id === id));
    if (!selectedId) {
      throw new PluginRegistryError(`multiple enabled providers for ${capability} require an explicit priority policy`, 'ambiguous_capability');
    }
    return providers.find(({ plugin }) => plugin.manifest.id === selectedId);
  }

  validate() {
    const enabled = [...this.#registrations.values()].filter(({ plugin }) => plugin.manifest.enabled);
    const allCapabilities = new Set(enabled.flatMap(({ plugin }) => plugin.manifest.capabilities));
    for (const capability of [...allCapabilities].sort()) this.#selectRegistration(capability);

    for (const { plugin } of enabled.sort((a, b) => a.plugin.manifest.id.localeCompare(b.plugin.manifest.id))) {
      for (const dependency of plugin.manifest.dependencies) {
        if (this.#providers(dependency.capability).length === 0) {
          if (!dependency.optional) {
            throw new PluginRegistryError(`${plugin.manifest.id} requires ${dependency.capability}`, 'missing_dependency');
          }
          continue;
        }
        this.#selectRegistration(dependency.capability);
      }
    }
    this.dependencyOrder();
    return this;
  }

  resolve(capability, selector) {
    const { plugin } = this.#selectRegistration(capability, selector);
    return plugin;
  }

  dependencyOrder() {
    const enabled = [...this.#registrations.values()]
      .filter(({ plugin }) => plugin.manifest.enabled)
      .sort((a, b) => a.plugin.manifest.id.localeCompare(b.plugin.manifest.id));
    const visited = new Set();
    const visiting = new Set();
    const ordered = [];

    const visit = (registration) => {
      const id = registration.plugin.manifest.id;
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new PluginRegistryError(`plugin dependency cycle includes ${id}`, 'dependency_cycle');
      visiting.add(id);
      for (const dependency of registration.plugin.manifest.dependencies) {
        const providers = this.#providers(dependency.capability);
        if (providers.length === 0 && dependency.optional) continue;
        const selected = this.#selectRegistration(dependency.capability);
        if (selected.plugin.manifest.id !== id) visit(selected);
      }
      visiting.delete(id);
      visited.add(id);
      ordered.push(id);
    };

    for (const registration of enabled) visit(registration);
    return Object.freeze(ordered);
  }

  async instantiate(capability, selector) {
    this.validate();
    const registration = this.#selectRegistration(capability, selector);
    const { plugin, config } = registration;
    if (!this.#instances.has(plugin.manifest.id)) {
      validatePluginConfig(plugin.manifest.configSchema, config);
      const created = Promise.resolve(plugin.create({
        ...this.#pluginContext,
        config: structuredClone(config),
        manifest: plugin.manifest,
        registry: this,
      }));
      this.#instances.set(plugin.manifest.id, created);
      created.catch(() => this.#instances.delete(plugin.manifest.id));
    }
    return this.#instances.get(plugin.manifest.id);
  }

  async health(context = {}) {
    this.validate();
    const plugins = [];
    for (const { plugin } of [...this.#registrations.values()]
      .filter(({ plugin }) => plugin.manifest.enabled)
      .sort((a, b) => a.plugin.manifest.id.localeCompare(b.plugin.manifest.id))) {
      try {
        const result = await plugin.manifest.healthCheck(context);
        plugins.push(Object.freeze({
          id: plugin.manifest.id,
          version: plugin.manifest.version,
          status: healthStatus(result),
        }));
      } catch {
        plugins.push(Object.freeze({ id: plugin.manifest.id, version: plugin.manifest.version, status: 'unhealthy', code: 'health_check_failed' }));
      }
    }
    const status = plugins.some((plugin) => plugin.status === 'unhealthy')
      ? 'unhealthy'
      : plugins.some((plugin) => plugin.status === 'degraded') ? 'degraded' : 'healthy';
    return Object.freeze({ ok: status !== 'unhealthy', status, plugins: Object.freeze(plugins) });
  }

  describe() {
    this.validate();
    const plugins = [...this.#registrations.values()]
      .filter(({ plugin }) => plugin.manifest.enabled)
      .sort((a, b) => a.plugin.manifest.id.localeCompare(b.plugin.manifest.id))
      .map(({ plugin }) => Object.freeze({
        id: plugin.manifest.id,
        version: plugin.manifest.version,
        capabilities: plugin.manifest.capabilities,
        dependencies: plugin.manifest.dependencies,
        migrationVersion: plugin.manifest.migrationVersion,
      }));
    const capabilities = [...new Set(plugins.flatMap((plugin) => plugin.capabilities))]
      .sort()
      .map((capability) => Object.freeze({ capability, providerId: this.#selectRegistration(capability).plugin.manifest.id }));
    return Object.freeze({
      plugins: Object.freeze(plugins),
      capabilities: Object.freeze(capabilities),
      dependencyOrder: this.dependencyOrder(),
    });
  }
}
