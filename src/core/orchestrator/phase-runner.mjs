import { createHash } from 'node:crypto';
import { assertLegalTransition } from '../state/lifecycle.mjs';

export const ORCHESTRATOR_PHASES = Object.freeze([
  'ingest',
  'extract',
  'classify',
  'cluster',
  'generate',
  'review',
  'publish',
  'read-model',
]);

const PHASE_SET = new Set(ORCHESTRATOR_PHASES);
const RESERVED_OPERATIONS = new Set(['constructor', 'prototype', '__proto__']);

export class PhaseRunnerError extends Error {
  constructor(message, code = 'phase_runner_error') {
    super(message);
    this.name = 'PhaseRunnerError';
    this.code = code;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new PhaseRunnerError('idempotency input must contain finite numbers', 'invalid_idempotency_input');
    return value;
  }
  if (typeof value !== 'object') throw new PhaseRunnerError('idempotency input must be serializable', 'invalid_idempotency_input');
  if (seen.has(value)) throw new PhaseRunnerError('idempotency input must not contain cycles', 'invalid_idempotency_input');
  seen.add(value);
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => canonicalize(entry, seen));
    seen.delete(value);
    return normalized;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new PhaseRunnerError('idempotency input must contain only plain objects and arrays', 'invalid_idempotency_input');
  }
  const normalized = Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key], seen)]));
  seen.delete(value);
  return normalized;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function validateRequest(request) {
  if (!request || typeof request !== 'object') throw new PhaseRunnerError('phase request must be an object', 'invalid_phase_request');
  if (!PHASE_SET.has(request.phase)) throw new PhaseRunnerError(`unknown orchestrator phase ${String(request.phase)}`, 'unknown_phase');
  for (const field of ['articleId', 'capability', 'toState', 'idempotencyKey', 'correlationId']) {
    if (!nonEmptyString(request[field])) throw new PhaseRunnerError(`${field} is required`, `missing_${field}`);
  }
  if (!(nonEmptyString(request.actor) || (request.actor && nonEmptyString(request.actor.type) && nonEmptyString(request.actor.id)))) {
    throw new PhaseRunnerError('actor is required', 'missing_actor');
  }
  if (!request.reason || !nonEmptyString(request.reason.code) || !nonEmptyString(request.reason.detail)) {
    throw new PhaseRunnerError('reason code and detail are required', 'missing_reason');
  }
  for (const field of ['pipelineVersion', 'sourceVersion']) {
    if (!(nonEmptyString(request[field]) || (Number.isSafeInteger(request[field]) && request[field] >= 0))) {
      throw new PhaseRunnerError(`${field} is required`, `missing_${field}`);
    }
  }
  const operation = request.operation ?? 'run';
  if (!/^[a-z][a-zA-Z0-9_]*$/.test(operation) || RESERVED_OPERATIONS.has(operation)) {
    throw new PhaseRunnerError('operation must be a safe provider method name', 'invalid_operation');
  }
  return operation;
}

export class PhaseRunner {
  constructor({ registry, storage }) {
    if (!registry || typeof registry.resolve !== 'function' || typeof registry.instantiate !== 'function') {
      throw new PhaseRunnerError('phase runner requires a plugin registry', 'invalid_registry');
    }
    if (!storage || typeof storage.transaction !== 'function') {
      throw new PhaseRunnerError('phase runner requires transactional storage', 'invalid_storage');
    }
    this.registry = registry;
    this.storage = storage;
  }

  async run(request) {
    const operation = validateRequest(request);
    const selectedPlugin = this.registry.resolve(request.capability, request.selector);

    const requestFingerprint = fingerprint({
      phase: request.phase,
      articleId: request.articleId,
      capability: request.capability,
      providerId: selectedPlugin.manifest.id,
      operation,
      input: request.input ?? null,
      toState: request.toState,
      actor: request.actor,
      reason: request.reason,
      pipelineVersion: request.pipelineVersion,
      sourceVersion: request.sourceVersion,
      correlationId: request.correlationId,
      fromState: request.fromState ?? null,
      expectedArticleVersion: request.expectedArticleVersion ?? null,
    });

    return this.storage.transaction(async (tx) => {
      const prior = await tx.getIdempotency(request.idempotencyKey);
      if (prior) {
        if (prior.fingerprint !== requestFingerprint) {
          throw new PhaseRunnerError(`idempotency key ${request.idempotencyKey} was reused with different input`, 'idempotency_conflict');
        }
        return { ...prior.response, replayed: true };
      }

      const article = await tx.getArticle(request.articleId);
      if (!article) throw new PhaseRunnerError(`article ${request.articleId} was not found`, 'article_not_found');
      if (request.fromState !== undefined && request.fromState !== article.state) {
        throw new PhaseRunnerError(`expected article state ${request.fromState}, found ${article.state}`, 'state_conflict');
      }
      if (request.expectedArticleVersion !== undefined && request.expectedArticleVersion !== article.version) {
        throw new PhaseRunnerError(`expected article version ${request.expectedArticleVersion}, found ${article.version}`, 'version_conflict');
      }
      const restoredState = article.state === 'quarantined'
        ? article.quarantinedFrom
        : article.state === 'deleted'
          ? article.deletedFrom
          : undefined;
      assertLegalTransition(article.state, request.toState, { restoredState });

      const provider = await this.registry.instantiate(request.capability, request.selector);
      const handler = provider?.[operation];
      if (typeof handler !== 'function') {
        throw new PhaseRunnerError(`${selectedPlugin.manifest.id} does not implement ${operation}`, 'missing_provider_operation');
      }

      const providerResult = await handler.call(provider, request.input, Object.freeze({
        phase: request.phase,
        article: structuredClone(article),
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        providerId: selectedPlugin.manifest.id,
        providerVersion: selectedPlugin.manifest.version,
      }));

      let transition = null;
      if (providerResult?.ok !== false) {
        transition = await tx.transition({
          articleId: request.articleId,
          fromState: article.state,
          toState: request.toState,
          actor: request.actor,
          reason: request.reason,
          pipelineVersion: request.pipelineVersion,
          sourceVersion: request.sourceVersion,
          expectedArticleVersion: article.version,
          idempotencyKey: request.idempotencyKey,
          correlationId: request.correlationId,
        });
      }

      const response = {
        ok: providerResult?.ok !== false,
        phase: request.phase,
        provider: {
          id: selectedPlugin.manifest.id,
          version: selectedPlugin.manifest.version,
        },
        result: providerResult,
        transition,
        replayed: false,
      };
      await tx.putIdempotency(request.idempotencyKey, { fingerprint: requestFingerprint, response });
      return response;
    });
  }
}

export function createPhaseRunner(options) {
  return new PhaseRunner(options);
}
