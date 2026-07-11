export const CANONICAL_STATES = Object.freeze([
  'discovered',
  'fetched',
  'extracted',
  'extraction_failed',
  'clean_source',
  'low_relevance',
  'duplicate',
  'source_signal',
  'editorial_candidate',
  'drafting',
  'review_failed',
  'publish_ready',
  'published',
  'unpublished',
  'archived',
  'quarantined',
  'deleted',
]);

const STATE_SET = new Set(CANONICAL_STATES);
const QUARANTINE_ELIGIBLE = new Set(CANONICAL_STATES.filter((state) => !['archived', 'quarantined', 'deleted'].includes(state)));

export const SOFT_DELETABLE_STATES = Object.freeze(CANONICAL_STATES.filter((state) => state !== 'deleted'));

const SOFT_DELETABLE_SET = new Set(SOFT_DELETABLE_STATES);
const BASE_TRANSITIONS = {
  discovered: ['fetched'],
  fetched: ['extracted', 'extraction_failed'],
  extracted: ['clean_source', 'extraction_failed'],
  extraction_failed: ['fetched'],
  clean_source: ['low_relevance', 'duplicate', 'source_signal', 'editorial_candidate'],
  low_relevance: ['clean_source'],
  duplicate: ['clean_source'],
  source_signal: ['editorial_candidate', 'archived'],
  editorial_candidate: ['drafting'],
  drafting: ['review_failed', 'publish_ready'],
  review_failed: ['drafting', 'source_signal'],
  publish_ready: ['published', 'source_signal'],
  published: ['unpublished', 'archived'],
  unpublished: ['published', 'archived'],
  archived: [],
  quarantined: ['archived'],
  deleted: [],
};

export const LEGAL_TRANSITIONS = Object.freeze(Object.fromEntries(CANONICAL_STATES.map((state) => {
  const targets = new Set(BASE_TRANSITIONS[state]);
  if (QUARANTINE_ELIGIBLE.has(state)) targets.add('quarantined');
  if (SOFT_DELETABLE_SET.has(state)) targets.add('deleted');
  return [state, Object.freeze([...targets])];
})));

export class LifecycleTransitionError extends Error {
  constructor(message, code = 'illegal_transition') {
    super(message);
    this.name = 'LifecycleTransitionError';
    this.code = code;
  }
}

export function isCanonicalState(state) {
  return STATE_SET.has(state);
}

export function isLegalTransition(fromState, toState, { restoredState } = {}) {
  if (!isCanonicalState(fromState) || !isCanonicalState(toState) || fromState === toState) return false;
  if (fromState === 'quarantined') {
    return toState === 'archived'
      || toState === 'deleted'
      || (restoredState === toState && QUARANTINE_ELIGIBLE.has(toState));
  }
  if (fromState === 'deleted') {
    return restoredState === toState && toState !== 'deleted';
  }
  return LEGAL_TRANSITIONS[fromState].includes(toState);
}

export function assertLegalTransition(fromState, toState, options) {
  if (!isCanonicalState(fromState)) throw new LifecycleTransitionError(`unknown lifecycle state ${String(fromState)}`, 'unknown_from_state');
  if (!isCanonicalState(toState)) throw new LifecycleTransitionError(`unknown lifecycle state ${String(toState)}`, 'unknown_to_state');
  if (!isLegalTransition(fromState, toState, options)) {
    throw new LifecycleTransitionError(`illegal lifecycle transition ${fromState} -> ${toState}`);
  }
}
