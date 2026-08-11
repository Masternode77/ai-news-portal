import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { safeHttpUrl } from './normalize.mjs';
import { resolveRepositoryFile } from './repository-file-resolver.mjs';

export const SOURCE_REGISTRY_PATH = resolveRepositoryFile('config/sourceRegistry.yml');
export const SOURCE_RIGHTS_REVIEW_MAX_AGE_DAYS = 365;

export const REQUESTED_SOURCE_IDS = [
  'datacenterdynamics',
  'uptime-institute-journal',
  'hpcwire',
  'insidehpc',
  'blocks-and-files',
  'siliconangle-ai',
  'theregister-data-centre',
  'utility-dive',
  'power-engineering',
  'capacity-media',
];

function coerceValue(raw = '') {
  const value = String(raw).trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseSourceRegistryYaml(raw = '') {
  const sources = [];
  let current = null;

  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#') || line.trim() === 'sources:') continue;
    const itemMatch = line.match(/^\s*-\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (itemMatch) {
      if (current) sources.push(current);
      current = { [itemMatch[1]]: coerceValue(itemMatch[2]) };
      continue;
    }
    const fieldMatch = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (fieldMatch && current) {
      current[fieldMatch[1]] = coerceValue(fieldMatch[2]);
    }
  }

  if (current) sources.push(current);
  return sources.filter((source) => source.id && source.name && source.domain);
}

export async function loadSourceRegistry(filePath = SOURCE_REGISTRY_PATH) {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseSourceRegistryYaml(raw);
}

export function loadSourceRegistrySync(filePath = SOURCE_REGISTRY_PATH) {
  return parseSourceRegistryYaml(fsSync.readFileSync(filePath, 'utf8'));
}

function normalizedHost(value = '') {
  try {
    return new URL(String(value || '').trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function registeredSourceFor(subject = {}, sources = []) {
  const sourceId = String(subject.sourceRegistryId || subject.source_id || '').trim().toLowerCase();
  if (sourceId) {
    const byId = sources.find((source) => String(source.id || '').trim().toLowerCase() === sourceId);
    if (byId) return byId;
  }

  const sourceHosts = [subject.sourceUrl, subject.canonicalUrl, subject.url, subject.link]
    .map(normalizedHost)
    .filter(Boolean);
  const byDomain = sources.find((source) => {
    const domain = String(source.domain || '').trim().toLowerCase().replace(/^www\./, '');
    return domain && sourceHosts.some((host) => host === domain || host.endsWith(`.${domain}`));
  });
  if (byDomain) return byDomain;

  const sourceName = String(subject.source || subject.source_name || '').trim().toLowerCase();
  return sources.find((source) => String(source.name || '').trim().toLowerCase() === sourceName) || null;
}

function rightsMetadataDetail(source = {}, usage = 'image', now = new Date()) {
  const basisField = usage === 'text' ? 'text_use_basis' : 'image_use_basis';
  const allowField = usage === 'text' ? 'allow_text_use' : 'allow_image_reuse';
  if (!Object.hasOwn(source, basisField)
    || !Object.hasOwn(source, allowField)
    || !Object.hasOwn(source, 'terms_url')
    || !Object.hasOwn(source, 'reviewed_at')) {
    return 'rights_metadata_missing';
  }
  if (source[allowField] !== true) return 'authorization_disabled';
  const basis = String(source[basisField] || '').trim().toLowerCase();
  if (!basis || ['none', 'pending', 'unknown', 'unreviewed'].includes(basis)) return 'use_basis_not_approved';
  if (!/^https:\/\//i.test(String(source.terms_url || '').trim())) return 'terms_url_missing';

  const reviewedAt = new Date(String(source.reviewed_at || ''));
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const reviewedMs = reviewedAt.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(reviewedMs)) return 'reviewed_at_invalid';
  const ageDays = (nowMs - reviewedMs) / 86_400_000;
  if (ageDays < 0) return 'reviewed_at_in_future';
  if (ageDays > SOURCE_RIGHTS_REVIEW_MAX_AGE_DAYS) return 'rights_review_expired';
  return '';
}

export function sourceUsageDecision(subject = {}, sources = [], usage = 'image', now = new Date()) {
  const source = registeredSourceFor(subject, sources);
  const reason = usage === 'text' ? 'text_use_not_authorized' : 'image_reuse_not_authorized';
  if (!source) return { authorized: false, reason, detail: 'source_not_registered', sourceId: '' };
  const detail = rightsMetadataDetail(source, usage, now);
  return {
    authorized: !detail,
    reason: detail ? reason : '',
    detail,
    sourceId: source.id,
  };
}

export function requestedSourceCoverage(sources = []) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return REQUESTED_SOURCE_IDS.map((id) => ({
    id,
    present: byId.has(id),
    source: byId.get(id) || null,
  }));
}

export function activeRegistryFeeds(sources = [], now = new Date()) {
  return sources
    .filter((source) => safeHttpUrl(source.feed)
      && !['blocked', 'paywalled', 'extraction_failed'].includes(source.status)
      && sourceUsageDecision({ sourceRegistryId: source.id }, sources, 'text', now).authorized)
    .map((source) => ({
      sourceRegistryId: source.id,
      source: source.name,
      url: safeHttpUrl(source.feed),
      region: source.region || 'Global',
      language: source.language || 'en',
      defaultCategory: source.defaultCategory || 'AI Infrastructure (GPU/Neocloud)',
    }));
}

export function textAuthorizedRecords(records = [], sources = [], now = new Date()) {
  const activeSourceIds = new Set(activeRegistryFeeds(sources, now).map((feed) => feed.sourceRegistryId));
  return records.filter((record) => {
    const decision = sourceUsageDecision(record, sources, 'text', now);
    const source = sources.find((candidate) => candidate.id === decision.sourceId);
    const recordHost = normalizedHost(record.sourceUrl || record.canonicalUrl || record.url || record.link);
    const sourceDomain = String(source?.domain || '').trim().toLowerCase().replace(/^www\./, '');
    const domainMatches = sourceDomain && (recordHost === sourceDomain || recordHost.endsWith(`.${sourceDomain}`));
    return decision.authorized && activeSourceIds.has(decision.sourceId) && domainMatches;
  });
}
