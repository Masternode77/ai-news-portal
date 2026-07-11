const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9-]*)+$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export class PluginContractError extends TypeError {
  constructor(message, code = 'invalid_plugin_contract') {
    super(message);
    this.name = 'PluginContractError';
    this.code = code;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message, code) {
  if (!condition) throw new PluginContractError(message, code);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return structuredClone(value);
  } catch {
    throw new PluginContractError('configSchema must contain only cloneable JSON values', 'invalid_config_schema');
  }
}

function freezeJson(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

export function isPluginId(value) {
  return typeof value === 'string' && PLUGIN_ID_PATTERN.test(value);
}

export function isCapability(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value);
}

export function isSemanticVersion(value) {
  return typeof value === 'string' && SEMVER_PATTERN.test(value);
}

export function validatePluginManifest(manifest) {
  assert(isObject(manifest), 'plugin manifest must be an object');
  assert(isPluginId(manifest.id), 'plugin id must be a lowercase namespaced identifier', 'invalid_plugin_id');
  assert(isSemanticVersion(manifest.version), 'plugin version must be semantic versioning', 'invalid_plugin_version');
  assert(Array.isArray(manifest.capabilities) && manifest.capabilities.length > 0, 'plugin capabilities must be a non-empty array', 'invalid_plugin_capabilities');
  assert(manifest.capabilities.every(isCapability), 'plugin capabilities contain an invalid identifier', 'invalid_plugin_capabilities');
  assert(new Set(manifest.capabilities).size === manifest.capabilities.length, 'plugin capabilities must be unique', 'duplicate_plugin_capability');
  assert(manifest.configSchema === true || manifest.configSchema === false || isObject(manifest.configSchema), 'plugin configSchema must be a JSON Schema object or boolean', 'invalid_config_schema');
  assert(Array.isArray(manifest.dependencies), 'plugin dependencies must be an array', 'invalid_plugin_dependencies');
  assert(typeof manifest.enabled === 'boolean', 'plugin enabled must be boolean', 'invalid_plugin_enabled');
  assert(Number.isSafeInteger(manifest.migrationVersion) && manifest.migrationVersion >= 0, 'plugin migrationVersion must be a non-negative integer', 'invalid_migration_version');
  assert(typeof manifest.healthCheck === 'function', 'plugin healthCheck must be a function', 'invalid_health_check');

  const dependencies = manifest.dependencies.map((dependency) => {
    assert(isObject(dependency), 'plugin dependency must be an object', 'invalid_plugin_dependency');
    assert(isCapability(dependency.capability), 'plugin dependency capability is invalid', 'invalid_plugin_dependency');
    assert(dependency.optional === undefined || typeof dependency.optional === 'boolean', 'plugin dependency optional flag must be boolean', 'invalid_plugin_dependency');
    return Object.freeze({ capability: dependency.capability, optional: dependency.optional === true });
  });
  assert(new Set(dependencies.map(({ capability }) => capability)).size === dependencies.length, 'plugin dependencies must be unique by capability', 'duplicate_plugin_dependency');

  return Object.freeze({
    id: manifest.id,
    version: manifest.version,
    capabilities: Object.freeze([...manifest.capabilities].sort()),
    configSchema: freezeJson(cloneJson(manifest.configSchema)),
    dependencies: Object.freeze(dependencies.sort((a, b) => a.capability.localeCompare(b.capability))),
    enabled: manifest.enabled,
    migrationVersion: manifest.migrationVersion,
    healthCheck: manifest.healthCheck,
  });
}

export function validatePlugin(plugin) {
  assert(isObject(plugin), 'plugin must be an object');
  assert(typeof plugin.create === 'function', 'plugin create must be a function', 'invalid_plugin_factory');
  return Object.freeze({ manifest: validatePluginManifest(plugin.manifest), create: plugin.create });
}

function matchesType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isObject(value);
  if (type === 'integer') return Number.isSafeInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function validateSchemaNode(schema, value, path, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${path} is not allowed`);
    return;
  }

  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
    errors.push(`${path} must be ${types.join(' or ')}`);
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path} must match an allowed value`);
  }
  if (Object.hasOwn(schema, 'const') && !Object.is(schema.const, value)) errors.push(`${path} must match its constant value`);

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const required of Array.isArray(schema.required) ? schema.required : []) {
      if (!Object.hasOwn(value, required)) errors.push(`${path}.${required} is required`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) validateSchemaNode(properties[key], child, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}.${key} is not allowed`);
      else if (isObject(schema.additionalProperties) || typeof schema.additionalProperties === 'boolean') {
        validateSchemaNode(schema.additionalProperties, child, `${path}.${key}`, errors);
      }
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((child, index) => validateSchemaNode(schema.items, child, `${path}[${index}]`, errors));
  }
  if (typeof value === 'string') {
    if (Number.isSafeInteger(schema.minLength) && value.length < schema.minLength) errors.push(`${path} is shorter than allowed`);
    if (Number.isSafeInteger(schema.maxLength) && value.length > schema.maxLength) errors.push(`${path} is longer than allowed`);
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path} does not match its required pattern`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path} is below its minimum`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path} is above its maximum`);
  }
}

export function validatePluginConfig(schema, config) {
  const errors = [];
  validateSchemaNode(schema, config, 'config', errors);
  if (errors.length > 0) throw new PluginContractError(errors.join('; '), 'invalid_plugin_config');
  return config;
}
