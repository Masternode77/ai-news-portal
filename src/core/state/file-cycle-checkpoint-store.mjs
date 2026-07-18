import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isCanonicalState } from './lifecycle.mjs';
import { validateTransitionRecord } from './transition-record.mjs';

const CONTENT_CYCLE_PHASES = Object.freeze([
  'ingest',
  'extract',
  'classify',
  'cluster',
  'generate',
  'review',
  'publish',
]);

export class FileCycleCheckpointError extends Error {
  constructor(message, code = 'file_cycle_checkpoint_error') {
    super(message);
    this.name = 'FileCycleCheckpointError';
    this.code = code;
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validVersion(value) {
  return nonEmptyString(value) || (Number.isSafeInteger(value) && value >= 0);
}

function validTimestamp(value) {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function validExecutionIdentity(value) {
  if (value === undefined || value === null) return true;
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && nonEmptyString(value.kind)
    && nonEmptyString(value.revision)
    && nonEmptyString(value.fingerprint);
}

function validExecutionInput(checkpoint) {
  if (checkpoint.executionIdentity === undefined || checkpoint.executionIdentity === null) {
    return checkpoint.executionInput === undefined || checkpoint.executionInput === null;
  }
  return checkpoint.executionInput
    && typeof checkpoint.executionInput === 'object'
    && !Array.isArray(checkpoint.executionInput);
}

function samePhasePrefix(phases) {
  return phases.length <= CONTENT_CYCLE_PHASES.length
    && phases.every((phase, index) => phase === CONTENT_CYCLE_PHASES[index]);
}

function validateLifecycle(checkpoint) {
  const articles = checkpoint.lifecycle.articles;
  const replay = new Map();
  for (const [id, article] of Object.entries(articles)) {
    if (!article
      || typeof article !== 'object'
      || Array.isArray(article)
      || article.id !== id
      || !isCanonicalState(article.state)
      || !Number.isSafeInteger(article.version)
      || article.version < 0
      || !validVersion(article.sourceVersion)
      || article.pipelineVersion !== checkpoint.pipelineVersion) {
      throw new FileCycleCheckpointError('content cycle article lifecycle is invalid', 'invalid_checkpoint');
    }
    replay.set(id, { state: 'discovered', version: 0, sourceVersion: article.sourceVersion });
  }
  try {
    for (const rawRecord of checkpoint.lifecycle.transitions) {
      const record = validateTransitionRecord(rawRecord);
      const current = replay.get(record.articleId);
      if (!current
        || record.pipelineVersion !== checkpoint.pipelineVersion
        || record.correlationId !== checkpoint.runId
        || record.fromState !== current.state
        || record.articleVersion !== current.version + 1) {
        throw new FileCycleCheckpointError('content cycle transition journal is inconsistent', 'invalid_checkpoint');
      }
      replay.set(record.articleId, {
        state: record.toState,
        version: record.articleVersion,
        sourceVersion: record.sourceVersion,
      });
    }
  } catch (error) {
    if (error instanceof FileCycleCheckpointError) throw error;
    throw new FileCycleCheckpointError('content cycle transition journal is invalid', 'invalid_checkpoint');
  }
  for (const [id, article] of Object.entries(articles)) {
    const restored = replay.get(id);
    if (restored.state !== article.state
      || restored.version !== article.version
      || restored.sourceVersion !== article.sourceVersion) {
      throw new FileCycleCheckpointError('content cycle lifecycle snapshot does not match its journal', 'invalid_checkpoint');
    }
  }
}

function validateCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
    throw new FileCycleCheckpointError('content cycle checkpoint must be an object', 'invalid_checkpoint');
  }
  if (checkpoint.schemaVersion !== 1
    || !nonEmptyString(checkpoint.runId)
    || !nonEmptyString(checkpoint.pipelineVersion)
    || !validTimestamp(checkpoint.createdAt)
    || !validTimestamp(checkpoint.updatedAt)) {
    throw new FileCycleCheckpointError('content cycle checkpoint identity is invalid', 'invalid_checkpoint');
  }
  if (!['active', 'failed', 'completed'].includes(checkpoint.status)) {
    throw new FileCycleCheckpointError('content cycle checkpoint status is invalid', 'invalid_checkpoint');
  }
  if (!Array.isArray(checkpoint.completedPhases)
    || !samePhasePrefix(checkpoint.completedPhases)
    || !Array.isArray(checkpoint.providerReceipts)
    || checkpoint.providerReceipts.length !== checkpoint.completedPhases.length
    || !checkpoint.lifecycle
    || typeof checkpoint.lifecycle !== 'object'
    || Array.isArray(checkpoint.lifecycle)
    || !checkpoint.lifecycle.articles
    || typeof checkpoint.lifecycle.articles !== 'object'
    || Array.isArray(checkpoint.lifecycle.articles)
    || !Array.isArray(checkpoint.lifecycle.transitions)
    || !validExecutionIdentity(checkpoint.executionIdentity)
    || !validExecutionInput(checkpoint)) {
    throw new FileCycleCheckpointError('content cycle checkpoint shape is invalid', 'invalid_checkpoint');
  }
  const nextPhase = CONTENT_CYCLE_PHASES[checkpoint.completedPhases.length] || null;
  if (checkpoint.currentPhase !== null && checkpoint.currentPhase !== nextPhase) {
    throw new FileCycleCheckpointError('content cycle checkpoint current phase is invalid', 'invalid_checkpoint');
  }
  if (checkpoint.providerReceipts.some((receipt, index) => (
    receipt?.phase !== checkpoint.completedPhases[index]
      || !nonEmptyString(receipt.providerId)
      || !nonEmptyString(receipt.providerVersion)
      || !validTimestamp(receipt.completedAt)
  ))) {
    throw new FileCycleCheckpointError('content cycle checkpoint provider receipts are invalid', 'invalid_checkpoint');
  }
  if (checkpoint.status === 'completed'
    && (nextPhase !== null || checkpoint.currentPhase !== null || checkpoint.failure !== null)) {
    throw new FileCycleCheckpointError('completed content cycle checkpoint is inconsistent', 'invalid_checkpoint');
  }
  if (checkpoint.status === 'active'
    && (nextPhase === null || checkpoint.failure !== null)) {
    throw new FileCycleCheckpointError('active content cycle checkpoint is inconsistent', 'invalid_checkpoint');
  }
  if (checkpoint.status === 'failed'
    && (nextPhase === null
      || checkpoint.currentPhase !== nextPhase
      || checkpoint.failure?.phase !== nextPhase
      || !nonEmptyString(checkpoint.failure?.providerId)
      || !nonEmptyString(checkpoint.failure?.code))) {
    throw new FileCycleCheckpointError('failed content cycle checkpoint is inconsistent', 'invalid_checkpoint');
  }
  validateLifecycle(checkpoint);
  return checkpoint;
}

export class FileCycleCheckpointStore {
  constructor(filePath) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      throw new FileCycleCheckpointError('checkpoint path is required', 'invalid_checkpoint_path');
    }
    this.filePath = path.resolve(filePath);
    const lockKey = createHash('sha256').update(this.filePath).digest('hex').slice(0, 24);
    this.lockPath = path.join(os.tmpdir(), `compute-current-content-cycle-${lockKey}.lock`);
    this.activeLeaseToken = null;
    this.leaseLost = false;
  }

  async assertLeaseOwnership() {
    if (!this.activeLeaseToken) return;
    if (this.leaseLost) {
      throw new FileCycleCheckpointError('content cycle lease ownership was lost', 'checkpoint_lease_lost');
    }
    try {
      const current = JSON.parse(await fs.readFile(this.lockPath, 'utf8'));
      if (current?.token !== this.activeLeaseToken) {
        this.leaseLost = true;
        throw new FileCycleCheckpointError('content cycle lease ownership was lost', 'checkpoint_lease_lost');
      }
    } catch (error) {
      if (error instanceof FileCycleCheckpointError) throw error;
      this.leaseLost = true;
      throw new FileCycleCheckpointError('content cycle lease ownership was lost', 'checkpoint_lease_lost');
    }
  }

  async acquireLease({ staleMs = 6 * 60 * 60 * 1000 } = {}) {
    await fs.mkdir(path.dirname(this.lockPath), { recursive: true });
    const token = randomUUID();
    let handle;

    try {
      handle = await fs.open(this.lockPath, 'wx', 0o600);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new FileCycleCheckpointError('another content cycle is already running', 'checkpoint_locked');
      }
      throw new FileCycleCheckpointError('content cycle lease could not be acquired', 'checkpoint_lease_failed');
    }

    try {
      await handle.writeFile(`${JSON.stringify({ token, acquiredAt: new Date().toISOString() })}\n`, 'utf8');
    } catch {
      await handle.close().catch(() => {});
      await fs.rm(this.lockPath, { force: true }).catch(() => {});
      throw new FileCycleCheckpointError('content cycle lease could not be persisted', 'checkpoint_lease_failed');
    }
    this.activeLeaseToken = token;
    this.leaseLost = false;

    let released = false;
    let heartbeat = Promise.resolve();
    const heartbeatMs = Math.max(10, Math.min(60_000, Math.floor(staleMs / 3)));
    const heartbeatTimer = setInterval(() => {
      heartbeat = heartbeat.then(async () => {
        if (released) return;
        try {
          const current = JSON.parse(await fs.readFile(this.lockPath, 'utf8'));
          if (current?.token !== token) {
            this.leaseLost = true;
            return;
          }
          if (released) return;
          const now = new Date();
          await fs.utimes(this.lockPath, now, now);
        } catch {
          this.leaseLost = true;
        }
      });
    }, heartbeatMs);
    heartbeatTimer.unref?.();

    return async () => {
      if (released) return;
      released = true;
      clearInterval(heartbeatTimer);
      await heartbeat.catch(() => {});
      await handle.close().catch(() => {});
      try {
        const current = JSON.parse(await fs.readFile(this.lockPath, 'utf8'));
        if (current?.token === token) await fs.rm(this.lockPath, { force: true });
      } catch {
        // A missing or replaced lease is not owned by this caller.
      }
      if (this.activeLeaseToken === token) this.activeLeaseToken = null;
    };
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      return clone(validateCheckpoint(parsed));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      if (error instanceof FileCycleCheckpointError) throw error;
      throw new FileCycleCheckpointError('content cycle checkpoint could not be read', 'checkpoint_read_failed');
    }
  }

  async save(checkpoint) {
    await this.assertLeaseOwnership();
    const valid = clone(validateCheckpoint(checkpoint));
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(valid, null, 2)}\n`, 'utf8');
      await fs.rename(temporaryPath, this.filePath);
    } catch {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw new FileCycleCheckpointError('content cycle checkpoint could not be saved', 'checkpoint_write_failed');
    }
    return clone(valid);
  }

  async clear() {
    await fs.rm(this.filePath, { force: true });
  }
}
