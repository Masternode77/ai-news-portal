import { assertLegalTransition, isCanonicalState } from './lifecycle.mjs';

export class TransitionRecordError extends TypeError {
  constructor(message, code = 'invalid_transition_record') {
    super(message);
    this.name = 'TransitionRecordError';
    this.code = code;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validVersion(value) {
  return nonEmptyString(value) || (Number.isSafeInteger(value) && value >= 0);
}

function validTimestamp(value) {
  if (!nonEmptyString(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function normalizeActor(actor) {
  if (nonEmptyString(actor)) return actor.trim();
  if (actor && typeof actor === 'object' && nonEmptyString(actor.type) && nonEmptyString(actor.id)) {
    return Object.freeze({ type: actor.type.trim(), id: actor.id.trim() });
  }
  throw new TransitionRecordError('transition actor must identify a system, service, or user', 'invalid_transition_actor');
}

function normalizeReason(reason) {
  if (!reason || typeof reason !== 'object' || !nonEmptyString(reason.code) || !nonEmptyString(reason.detail)) {
    throw new TransitionRecordError('transition reason must include non-empty code and detail', 'invalid_transition_reason');
  }
  return Object.freeze({ code: reason.code.trim(), detail: reason.detail.trim() });
}

export function validateTransitionRecord(record, { restoredState } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TransitionRecordError('transition record must be an object');
  if (!nonEmptyString(record.id)) throw new TransitionRecordError('transition id is required', 'missing_transition_id');
  if (!nonEmptyString(record.articleId)) throw new TransitionRecordError('transition articleId is required', 'missing_article_id');
  if (!isCanonicalState(record.fromState) || !isCanonicalState(record.toState)) throw new TransitionRecordError('transition states must be canonical', 'invalid_transition_state');
  assertLegalTransition(record.fromState, record.toState, { restoredState });
  if (!validTimestamp(record.timestamp)) throw new TransitionRecordError('transition timestamp must be an ISO UTC timestamp', 'invalid_transition_timestamp');
  if (!validVersion(record.pipelineVersion)) throw new TransitionRecordError('transition pipelineVersion is required', 'invalid_pipeline_version');
  if (!validVersion(record.sourceVersion)) throw new TransitionRecordError('transition sourceVersion is required', 'invalid_source_version');
  if (!Number.isSafeInteger(record.articleVersion) || record.articleVersion < 1) throw new TransitionRecordError('transition articleVersion must be a positive integer', 'invalid_article_version');
  if (!nonEmptyString(record.idempotencyKey)) throw new TransitionRecordError('transition idempotencyKey is required', 'missing_idempotency_key');
  if (!nonEmptyString(record.correlationId)) throw new TransitionRecordError('transition correlationId is required', 'missing_correlation_id');

  return Object.freeze({
    id: record.id.trim(),
    articleId: record.articleId.trim(),
    fromState: record.fromState,
    toState: record.toState,
    actor: normalizeActor(record.actor),
    timestamp: record.timestamp,
    reason: normalizeReason(record.reason),
    pipelineVersion: record.pipelineVersion,
    sourceVersion: record.sourceVersion,
    articleVersion: record.articleVersion,
    idempotencyKey: record.idempotencyKey.trim(),
    correlationId: record.correlationId.trim(),
  });
}

export function createTransitionRecord(input, { id, timestamp, restoredState } = {}) {
  return validateTransitionRecord({ ...input, id: id ?? input.id, timestamp: timestamp ?? input.timestamp }, { restoredState });
}
