import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { safePublicHttpUrl } from '../lib/public-url.js';

export const MAX_UPSTREAM_RECONCILIATION_CANDIDATES = 30;

const SOURCE_FIELDS = Object.freeze([
  'id',
  'publishedAt',
  'snippet',
  'source',
  'title',
  'url',
]);
const RFC3339_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const DISCOVERY_STRING_FIELDS = [
  'id',
  'title',
  'source',
  'canonicalSourceUrl',
  'sourceUrl',
  'url',
  'link',
  'publishedAt',
  'feedSnippet',
  'sourceSnippet',
  'rawSnippet',
  'rssSnippet',
  'snippet',
  'description',
];
const TRACKING_KEYS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasInvalidDiscoveryTypes(record) {
  return DISCOVERY_STRING_FIELDS.some((field) => (
    Object.hasOwn(record, field)
      && record[field] !== null
      && record[field] !== undefined
      && typeof record[field] !== 'string'
  ));
}

function firstString(record, fields) {
  for (const field of fields) {
    if (typeof record[field] === 'string' && record[field].trim()) return record[field];
  }
  return '';
}

function clean(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMarkup(value = '') {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeText(value = '') {
  return String(value || '')
    .replace(/\b(?:bye\s+end|end\s+bye)(?:\s+(?:bye\s+end|end\s+bye))*\b/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function truncateText(value = '', maxLength) {
  const sanitized = sanitizeText(value);
  if (!sanitized) return '';
  if (sanitized.length <= maxLength) return sanitized;
  return `${sanitized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function canonicalUrl(value) {
  const safeUrl = safePublicHttpUrl(value);
  if (!safeUrl || value.length > 2048) return '';
  const parsed = new URL(safeUrl);
  if (parsed.protocol !== 'https:' || parsed.port || isIP(parsed.hostname.replace(/^\[|\]$/g, ''))) return '';
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_KEYS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  return parsed.toString();
}

function stableSourceId(url, title) {
  const canonicalTitle = title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(`${url}|${canonicalTitle}`).digest('hex').slice(0, 16);
}

function normalizedPublishedAt(value = '') {
  if (typeof value !== 'string' || !RFC3339_TIMESTAMP.test(value)) return '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

export function sourceCandidateFromUpstream(record) {
  if (!plainRecord(record) || hasInvalidDiscoveryTypes(record)) return null;
  const title = truncateText(stripMarkup(clean(record.title)), 240);
  const source = truncateText(stripMarkup(clean(record.source)), 120);
  const url = canonicalUrl(firstString(record, ['canonicalSourceUrl', 'sourceUrl', 'url', 'link']));
  const publishedAt = normalizedPublishedAt(record.publishedAt);
  if (!title || !source || !url || !publishedAt) return null;

  return {
    id: stableSourceId(url, title),
    title,
    source,
    url,
    publishedAt,
    snippet: '',
  };
}

export function isCanonicalSourceCandidate(candidate) {
  if (!plainRecord(candidate)) return false;
  if (Object.keys(candidate).sort().join('\0') !== SOURCE_FIELDS.join('\0')) return false;
  const canonical = sourceCandidateFromUpstream(candidate);
  return canonical !== null
    && SOURCE_FIELDS.every((field) => canonical[field] === candidate[field]);
}

export function assertCanonicalSourceCandidateBatch(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('upstream reconciliation requires at least one source candidate');
  }
  if (candidates.length > MAX_UPSTREAM_RECONCILIATION_CANDIDATES) {
    throw new Error(`upstream reconciliation accepts at most ${MAX_UPSTREAM_RECONCILIATION_CANDIDATES} candidates`);
  }
  if (!candidates.every(isCanonicalSourceCandidate)) {
    throw new Error('upstream reconciliation candidates must contain only canonical source discovery fields');
  }
  return candidates;
}

export function reconciliationCandidateFingerprint(records = []) {
  if (!Array.isArray(records)) {
    throw new TypeError('reconciliation candidates must be an array');
  }
  const sourceProjection = records.map((record) => Object.fromEntries(
    SOURCE_FIELDS.map((field) => [field, record?.[field]]),
  ));
  return createHash('sha256').update(JSON.stringify(sourceProjection)).digest('hex');
}

export function expectedUpstreamReconciliationIdentity(input = {}) {
  if (!plainRecord(input)) throw new Error('content cycle input must be a plain object');
  const hasCandidates = Object.hasOwn(input, 'reconciliationCandidates');
  const hasRevision = Object.hasOwn(input, 'reconciliationRevision');
  if (!hasCandidates && !hasRevision) return null;
  if (!hasCandidates || !hasRevision) {
    throw new Error('upstream reconciliation requires candidates and a revision');
  }
  const candidates = input.reconciliationCandidates;
  assertCanonicalSourceCandidateBatch(candidates);
  if (typeof input.reconciliationRevision !== 'string'
    || !/^[a-f0-9]{40}$/.test(input.reconciliationRevision)) {
    throw new Error('upstream reconciliation revision must be a full lowercase commit SHA');
  }
  return {
    kind: 'upstream-reconciliation',
    revision: input.reconciliationRevision,
    fingerprint: reconciliationCandidateFingerprint(candidates),
  };
}

export function assertUpstreamReconciliationExecution(input = {}, executionIdentity = null) {
  const expected = expectedUpstreamReconciliationIdentity(input);
  const isReconciliationIdentity = executionIdentity?.kind === 'upstream-reconciliation';
  if (!expected && !isReconciliationIdentity) return;
  if (!expected || !isReconciliationIdentity) {
    throw new Error('upstream reconciliation payload and execution identity must be provided together');
  }
  if (executionIdentity.revision !== expected.revision
    || executionIdentity.fingerprint !== expected.fingerprint) {
    throw new Error('upstream reconciliation execution identity does not match its source candidates');
  }
}
