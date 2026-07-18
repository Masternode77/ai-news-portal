import { randomUUID } from 'node:crypto';
import { assertLegalTransition } from '../state/lifecycle.mjs';
import { createTransitionRecord } from '../state/transition-record.mjs';
import { CONTENT_CYCLE_PHASES } from './content-cycle-phases.mjs';

export { CONTENT_CYCLE_PHASES } from './content-cycle-phases.mjs';

export class ContentCycleError extends Error {
  constructor(message, code = 'content_cycle_error') {
    super(message);
    this.name = 'ContentCycleError';
    this.code = code;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeExecutionIdentity(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContentCycleError('content cycle execution identity is invalid', 'invalid_execution_identity');
  }
  const identity = {
    kind: nonEmptyString(value.kind) ? value.kind.trim() : '',
    revision: nonEmptyString(value.revision) ? value.revision.trim() : '',
    fingerprint: nonEmptyString(value.fingerprint) ? value.fingerprint.trim() : '',
  };
  if (!identity.kind || !identity.revision || !identity.fingerprint) {
    throw new ContentCycleError('content cycle execution identity is invalid', 'invalid_execution_identity');
  }
  return identity;
}

function sameExecutionIdentity(left, right) {
  const normalizedLeft = normalizeExecutionIdentity(left);
  const normalizedRight = normalizeExecutionIdentity(right);
  return normalizedLeft?.kind === normalizedRight?.kind
    && normalizedLeft?.revision === normalizedRight?.revision
    && normalizedLeft?.fingerprint === normalizedRight?.fingerprint;
}

function assertExecutionIdentity(checkpoint, requestedIdentity) {
  const checkpointIdentity = normalizeExecutionIdentity(checkpoint.executionIdentity);
  const normalizedRequest = normalizeExecutionIdentity(requestedIdentity);
  if (!sameExecutionIdentity(checkpointIdentity, normalizedRequest)) {
    throw new ContentCycleError(
      'active content cycle checkpoint belongs to a different execution',
      'checkpoint_execution_identity_mismatch',
    );
  }
}

function defaultCapabilities() {
  return Object.fromEntries(CONTENT_CYCLE_PHASES.map((phase) => [phase, `content.${phase}`]));
}

function validateDependencies({
  registry,
  checkpointStore,
  completedRunVerifier,
  phaseCapabilities,
  pipelineVersion,
  executionIdentityValidator,
}) {
  if (!registry || typeof registry.resolve !== 'function' || typeof registry.instantiate !== 'function') {
    throw new ContentCycleError('content cycle requires a plugin registry', 'invalid_registry');
  }
  if (!checkpointStore || typeof checkpointStore.load !== 'function' || typeof checkpointStore.save !== 'function') {
    throw new ContentCycleError('content cycle requires a checkpoint store', 'invalid_checkpoint_store');
  }
  if (completedRunVerifier !== undefined && typeof completedRunVerifier !== 'function') {
    throw new ContentCycleError('completed run verifier must be a function', 'invalid_completed_run_verifier');
  }
  if (!nonEmptyString(pipelineVersion)) {
    throw new ContentCycleError('content cycle pipeline version is required', 'invalid_pipeline_version');
  }
  if (executionIdentityValidator !== undefined && typeof executionIdentityValidator !== 'function') {
    throw new ContentCycleError('execution identity validator must be a function', 'invalid_execution_identity_validator');
  }
  for (const phase of CONTENT_CYCLE_PHASES) {
    if (!nonEmptyString(phaseCapabilities[phase])) {
      throw new ContentCycleError(`content cycle capability is missing for ${phase}`, 'missing_phase_capability');
    }
  }
}

function newCheckpoint({ runId, timestamp, pipelineVersion, input, executionIdentity }) {
  return {
    schemaVersion: 1,
    pipelineVersion,
    runId,
    status: 'active',
    currentPhase: null,
    completedPhases: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    payload: structuredClone(input || {}),
    executionIdentity: normalizeExecutionIdentity(executionIdentity),
    executionInput: executionIdentity ? structuredClone(input || {}) : null,
    providerReceipts: [],
    failure: null,
    lifecycle: { articles: {}, transitions: [] },
  };
}

function phaseIndex(phase) {
  const index = CONTENT_CYCLE_PHASES.indexOf(phase);
  if (index < 0) throw new ContentCycleError(`unknown content cycle phase ${String(phase)}`, 'unknown_phase');
  return index;
}

function assertCheckpointVersion(checkpoint, pipelineVersion) {
  if (checkpoint.pipelineVersion !== pipelineVersion) {
    throw new ContentCycleError(
      `content cycle checkpoint version ${checkpoint.pipelineVersion} does not match ${pipelineVersion}`,
      'checkpoint_version_mismatch',
    );
  }
}

function safeProviderFailure(error) {
  const code = nonEmptyString(error?.code) ? error.code.trim() : 'provider_failed';
  return { code, retryable: error?.retryable === true };
}

function applyDiscoveries(checkpoint, discoveries = []) {
  if (!Array.isArray(discoveries)) throw new ContentCycleError('provider discoveries must be an array', 'invalid_provider_result');
  for (const discovery of discoveries) {
    if (!nonEmptyString(discovery?.id)) throw new ContentCycleError('discovered article id is required', 'invalid_discovery');
    const id = discovery.id.trim();
    if (checkpoint.lifecycle.articles[id]) continue;
    checkpoint.lifecycle.articles[id] = {
      id,
      state: 'discovered',
      version: 0,
      sourceVersion: discovery.sourceVersion ?? 'unknown',
      pipelineVersion: checkpoint.pipelineVersion,
    };
  }
}

function applyTransitions(checkpoint, transitions, { phase, provider, clock, idGenerator }) {
  if (!Array.isArray(transitions)) throw new ContentCycleError('provider transitions must be an array', 'invalid_provider_result');
  transitions.forEach((transition, index) => {
    if (!nonEmptyString(transition?.articleId)) {
      throw new ContentCycleError('transition article id is required', 'invalid_provider_transition');
    }
    const articleId = transition.articleId.trim();
    const article = checkpoint.lifecycle.articles[articleId];
    if (!article) throw new ContentCycleError(`transition article ${articleId} was not discovered`, 'article_not_discovered');
    if (transition.fromState !== undefined && transition.fromState !== article.state) {
      throw new ContentCycleError(
        `expected article ${articleId} state ${transition.fromState}, found ${article.state}`,
        'state_conflict',
      );
    }
    assertLegalTransition(article.state, transition.toState);
    const articleVersion = article.version + 1;
    const record = createTransitionRecord({
      articleId,
      fromState: article.state,
      toState: transition.toState,
      actor: { type: 'service', id: 'canonical-content-cycle' },
      reason: transition.reason,
      pipelineVersion: checkpoint.pipelineVersion,
      sourceVersion: transition.sourceVersion ?? article.sourceVersion ?? provider.version,
      articleVersion,
      idempotencyKey: `${checkpoint.runId}:${phase}:${articleId}:${index}`,
      correlationId: checkpoint.runId,
    }, {
      id: idGenerator(),
      timestamp: clock().toISOString(),
    });
    checkpoint.lifecycle.articles[articleId] = {
      ...article,
      state: transition.toState,
      version: articleVersion,
      sourceVersion: record.sourceVersion,
      pipelineVersion: checkpoint.pipelineVersion,
    };
    checkpoint.lifecycle.transitions.push(record);
  });
}

export class ContentCycleOrchestrator {
  constructor({
    registry,
    checkpointStore,
    completedRunVerifier,
    phaseCapabilities = defaultCapabilities(),
    pipelineVersion,
    executionIdentityValidator,
    clock = () => new Date(),
    idGenerator = randomUUID,
  }) {
    validateDependencies({
      registry,
      checkpointStore,
      completedRunVerifier,
      phaseCapabilities,
      pipelineVersion,
      executionIdentityValidator,
    });
    this.registry = registry;
    this.checkpointStore = checkpointStore;
    this.completedRunVerifier = completedRunVerifier;
    this.phaseCapabilities = Object.freeze({ ...phaseCapabilities });
    this.pipelineVersion = pipelineVersion;
    this.executionIdentityValidator = executionIdentityValidator;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async verifyCompletedRun(checkpoint) {
    if (!this.completedRunVerifier) return { ok: true, restored: [] };
    await this.checkpointStore.assertLeaseOwnership?.();
    let result;
    try {
      result = await this.completedRunVerifier(structuredClone(checkpoint));
    } catch (error) {
      throw new ContentCycleError(
        `completed content cycle output verification failed: ${error?.code || 'output_verification_failed'}`,
        error?.code || 'output_verification_failed',
      );
    }
    if (result?.ok !== true) {
      throw new ContentCycleError(
        `completed content cycle output verification failed: ${result?.code || 'output_verification_failed'}`,
        result?.code || 'output_verification_failed',
      );
    }
    return result;
  }

  async verifyCurrentCheckpoint() {
    const checkpoint = await this.checkpointStore.load();
    if (!checkpoint) return { status: 'missing', runId: null, executionIdentity: null };
    assertCheckpointVersion(checkpoint, this.pipelineVersion);
    if (checkpoint.status !== 'completed') {
      throw new ContentCycleError(
        'content cycle checkpoint is not completed',
        'checkpoint_not_completed',
      );
    }
    const verification = await this.verifyCompletedRun(checkpoint);
    return {
      status: 'completed',
      runId: checkpoint.runId,
      executionIdentity: normalizeExecutionIdentity(checkpoint.executionIdentity),
      restored: Array.isArray(verification?.restored) ? [...verification.restored] : [],
    };
  }

  createCheckpoint(input = {}, executionIdentity = null) {
    const timestamp = this.clock().toISOString();
    return newCheckpoint({
      runId: `content-cycle-${this.idGenerator()}`,
      timestamp,
      pipelineVersion: this.pipelineVersion,
      input,
      executionIdentity,
    });
  }

  async executePhase(checkpoint, phase) {
    const capability = this.phaseCapabilities[phase];
    const selected = this.registry.resolve(capability);
    const provider = await this.registry.instantiate(capability);
    if (typeof provider?.run !== 'function') {
      throw new ContentCycleError(`${selected.manifest.id} does not implement run`, 'missing_provider_operation');
    }

    checkpoint.currentPhase = phase;
    checkpoint.status = 'active';
    checkpoint.failure = null;
    checkpoint.updatedAt = this.clock().toISOString();
    await this.checkpointStore.save(checkpoint);
    await this.checkpointStore.assertLeaseOwnership?.();

    let result;
    try {
      result = await provider.run(structuredClone(checkpoint.payload), Object.freeze({
        runId: checkpoint.runId,
        phase,
        pipelineVersion: checkpoint.pipelineVersion,
        providerId: selected.manifest.id,
        providerVersion: selected.manifest.version,
        executionIdentity: normalizeExecutionIdentity(checkpoint.executionIdentity),
        assertExecutionOwnership: async () => this.checkpointStore.assertLeaseOwnership?.(),
      }));
      await this.checkpointStore.assertLeaseOwnership?.();
    } catch (error) {
      if (error?.code === 'checkpoint_lease_lost') throw error;
      result = { ok: false, error: safeProviderFailure(error), retryable: error?.retryable === true };
    }

    if (!result || typeof result !== 'object' || result.ok !== true) {
      const failure = safeProviderFailure(result?.error);
      checkpoint.status = 'failed';
      checkpoint.failure = { phase, providerId: selected.manifest.id, ...failure };
      checkpoint.updatedAt = this.clock().toISOString();
      await this.checkpointStore.save(checkpoint);
      throw new ContentCycleError(
        `content:${phase} failed in ${selected.manifest.id}: ${failure.code}`,
        failure.code,
      );
    }

    try {
      const draft = structuredClone(checkpoint);
      applyDiscoveries(draft, result.discoveries || []);
      applyTransitions(draft, result.transitions || [], {
        phase,
        provider: selected.manifest,
        clock: this.clock,
        idGenerator: this.idGenerator,
      });
      draft.payload = structuredClone(result.value ?? checkpoint.payload);
      draft.completedPhases.push(phase);
      draft.currentPhase = null;
      draft.status = phase === CONTENT_CYCLE_PHASES.at(-1) ? 'completed' : 'active';
      draft.failure = null;
      draft.updatedAt = this.clock().toISOString();
      draft.providerReceipts.push({
        phase,
        providerId: selected.manifest.id,
        providerVersion: selected.manifest.version,
        completedAt: draft.updatedAt,
      });
      await this.checkpointStore.save(draft);
      return draft;
    } catch (error) {
      const failure = safeProviderFailure(error);
      checkpoint.status = 'failed';
      checkpoint.failure = { phase, providerId: selected.manifest.id, ...failure };
      checkpoint.updatedAt = this.clock().toISOString();
      await this.checkpointStore.save(checkpoint);
      throw new ContentCycleError(
        `content:${phase} failed provider contract validation: ${failure.code}`,
        failure.code,
      );
    }
  }

  async runPhase(phase, { input = {}, executionIdentity = null } = {}) {
    this.executionIdentityValidator?.(input, executionIdentity);
    const index = phaseIndex(phase);
    let checkpoint = await this.checkpointStore.load();
    if (checkpoint) assertCheckpointVersion(checkpoint, this.pipelineVersion);
    if (checkpoint?.status === 'completed') await this.verifyCompletedRun(checkpoint);
    if (phase === 'ingest' && (!checkpoint || checkpoint.status === 'completed')) {
      checkpoint = this.createCheckpoint(input, executionIdentity);
      await this.checkpointStore.save(checkpoint);
    }
    if (!checkpoint) {
      throw new ContentCycleError('content cycle checkpoint is missing; run content:ingest first', 'missing_checkpoint');
    }
    assertCheckpointVersion(checkpoint, this.pipelineVersion);
    assertExecutionIdentity(checkpoint, executionIdentity);
    if (checkpoint.completedPhases.includes(phase)) {
      return { status: checkpoint.status, phase, runId: checkpoint.runId, replayed: true };
    }
    const expected = checkpoint.completedPhases.length;
    if (index !== expected) {
      throw new ContentCycleError(
        `content:${phase} is out of order; next phase is ${CONTENT_CYCLE_PHASES[expected] || 'none'}`,
        'phase_out_of_order',
      );
    }
    const completed = await this.executePhase(checkpoint, phase);
    return { status: completed.status, phase, runId: completed.runId, replayed: false };
  }

  async runCycle({ production = false, input = {}, executionIdentity = null } = {}) {
    if (production !== true) {
      throw new ContentCycleError('full content cycle requires an explicit production boundary', 'production_boundary_required');
    }
    this.executionIdentityValidator?.(input, executionIdentity);
    let checkpoint = await this.checkpointStore.load();
    if (checkpoint) assertCheckpointVersion(checkpoint, this.pipelineVersion);
    if (checkpoint?.status === 'completed') {
      await this.verifyCompletedRun(checkpoint);
      if (executionIdentity !== null
        && sameExecutionIdentity(checkpoint.executionIdentity, executionIdentity)) {
        return {
          status: checkpoint.status,
          runId: checkpoint.runId,
          completedPhases: [...checkpoint.completedPhases],
          executionIdentity: normalizeExecutionIdentity(checkpoint.executionIdentity),
          replayed: true,
        };
      }
    }
    if (!checkpoint || checkpoint.status === 'completed') {
      checkpoint = this.createCheckpoint(input, executionIdentity);
      await this.checkpointStore.save(checkpoint);
    } else {
      assertExecutionIdentity(checkpoint, executionIdentity);
    }
    assertCheckpointVersion(checkpoint, this.pipelineVersion);
    for (const phase of CONTENT_CYCLE_PHASES.slice(checkpoint.completedPhases.length)) {
      checkpoint = await this.executePhase(checkpoint, phase);
    }
    return {
      status: checkpoint.status,
      runId: checkpoint.runId,
      completedPhases: [...checkpoint.completedPhases],
      executionIdentity: normalizeExecutionIdentity(checkpoint.executionIdentity),
      replayed: false,
    };
  }
}

export function createContentCycleOrchestrator(options) {
  return new ContentCycleOrchestrator(options);
}
