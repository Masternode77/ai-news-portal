import { canonicalSourceKey } from './canonical-source.mjs';
import { stripHtml, truncate } from './normalize.mjs';
import { sourceCandidateFromUpstream } from '../../src/adapters/upstream-reconciliation-execution.mjs';

export { sourceCandidateFromUpstream } from '../../src/adapters/upstream-reconciliation-execution.mjs';

const INVALID_SOURCE_DISCOVERY = 'invalid_source_discovery';

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clean(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rejectedDiscovery(record, reason = INVALID_SOURCE_DISCOVERY) {
  const safeRecord = isPlainRecord(record) ? record : {};
  return {
    id: typeof safeRecord.id === 'string' ? clean(safeRecord.id) : '',
    title: typeof safeRecord.title === 'string'
      ? truncate(stripHtml(clean(safeRecord.title)), 240)
      : '',
    reason,
  };
}

function sourceDomainAllowed(url, allowedDomains = []) {
  if (!allowedDomains.length) return false;
  const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  return allowedDomains.some((domain) => {
    if (typeof domain !== 'string') return false;
    const normalized = clean(domain).replace(/^www\./, '').replace(/\.+$/, '').toLowerCase();
    return normalized && (hostname === normalized || hostname.endsWith(`.${normalized}`));
  });
}

export function buildUpstreamReconciliationAudit(
  localArticles = [],
  upstreamArticles = [],
  options = {},
) {
  if (!Array.isArray(localArticles) || !Array.isArray(upstreamArticles)) {
    throw new TypeError('reconciliation inputs must be arrays');
  }
  const localSourceKeys = new Set(
    localArticles
      .filter(isPlainRecord)
      .map((article) => canonicalSourceKey(article))
      .filter((key) => key && key !== 'id:'),
  );
  const seenUpstreamKeys = new Set();
  const candidates = [];
  const rejected = [];
  let alreadyPresent = 0;
  const allowedDomains = Array.isArray(options.allowedDomains) ? options.allowedDomains : [];

  for (const record of upstreamArticles) {
    const candidate = sourceCandidateFromUpstream(record);
    if (!candidate) {
      rejected.push(rejectedDiscovery(record));
      continue;
    }
    if (!sourceDomainAllowed(candidate.url, allowedDomains)) {
      rejected.push(rejectedDiscovery(record, 'unregistered_source_domain'));
      continue;
    }

    const sourceKey = canonicalSourceKey(candidate);
    if (localSourceKeys.has(sourceKey) || seenUpstreamKeys.has(sourceKey)) {
      alreadyPresent += 1;
      continue;
    }

    seenUpstreamKeys.add(sourceKey);
    candidates.push(candidate);
  }

  return {
    revision: clean(options.revision),
    counts: {
      upstream: upstreamArticles.length,
      alreadyPresent,
      reingest: candidates.length,
      rejected: rejected.length,
    },
    candidates,
    rejected,
  };
}
