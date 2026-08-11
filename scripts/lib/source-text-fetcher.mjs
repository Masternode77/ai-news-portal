import { fetchPublicResource, PublicNetworkFetchError } from './public-network-fetcher.mjs';
import { normalizeNetworkHost } from './public-network-address.mjs';
import { loadSourceRegistry, sourceUsageDecision } from './source-registry.mjs';

export const SOURCE_TEXT_MAX_BYTES = 2 * 1024 * 1024;

const ARTICLE_TEXT_TYPES = [
  'application/xhtml+xml',
  'text/html',
];

function configuredHosts(source = {}) {
  const configured = source.article_hosts ?? source.article_host_allowlist ?? '';
  const values = Array.isArray(configured) ? configured : String(configured).split(/[\s,]+/);
  return [...new Set([source.domain, ...values].map(normalizeNetworkHost).filter(Boolean))];
}

export function sourceTextTargetDecision(subject = {}, sources = [], now = new Date()) {
  const sourceId = String(subject.sourceRegistryId || subject.source_id || '').trim();
  const source = sources.find((entry) => String(entry?.id || '').trim() === sourceId);
  if (!source) return { authorized: false, reason: 'text_use_not_authorized', detail: 'source_not_registered' };
  if (source.status !== 'active_feed') {
    return { authorized: false, reason: 'text_use_not_authorized', detail: 'source_not_active' };
  }
  const rights = sourceUsageDecision({ sourceRegistryId: sourceId }, sources, 'text', now);
  if (!rights.authorized) return rights;

  let target;
  try {
    target = new URL(String(subject.url || subject.sourceUrl || '').trim());
  } catch {
    return { authorized: false, reason: 'unsafe_source_text_url', detail: 'malformed_url' };
  }
  if (target.protocol !== 'https:') return { authorized: false, reason: 'unsafe_source_text_url', detail: 'https_required' };
  if (target.username || target.password) return { authorized: false, reason: 'unsafe_source_text_url', detail: 'credentials_not_allowed' };
  if (target.port && target.port !== '443') return { authorized: false, reason: 'unsafe_source_text_url', detail: 'nonstandard_port' };
  const allowedHosts = configuredHosts(source);
  if (!allowedHosts.includes(normalizeNetworkHost(target.hostname))) {
    return { authorized: false, reason: 'unsafe_source_text_url', detail: 'article_host_not_allowlisted' };
  }
  return { authorized: true, reason: '', detail: '', sourceId, allowedHosts };
}

export async function fetchAuthorizedSourceText(subject = {}, options = {}) {
  const sources = options.sources || await loadSourceRegistry(options.registryPath);
  const decision = sourceTextTargetDecision(subject, sources, options.now || new Date());
  if (!decision.authorized) {
    const error = new Error(`${decision.reason}: ${decision.detail}`);
    error.code = decision.reason;
    error.detail = decision.detail;
    throw error;
  }
  try {
    const result = await fetchPublicResource(subject.url, {
      allowedHosts: decision.allowedHosts,
      contentTypes: ARTICLE_TEXT_TYPES,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; ComputeCurrentBot/1.0)',
      },
      maxBytes: options.maxBytes || SOURCE_TEXT_MAX_BYTES,
      request: options.request,
      resolveHost: options.resolveHost,
      timeoutMs: options.timeoutMs || 12_000,
    });
    return { ...result, text: result.bytes.toString('utf8'), sourceId: decision.sourceId };
  } catch (error) {
    if (!(error instanceof PublicNetworkFetchError)) throw error;
    const wrapped = new Error(`source_text_fetch_failed: ${error.code}`);
    wrapped.code = error.code === 'unsafe_remote_url' ? 'unsafe_source_text_url' : error.code;
    wrapped.detail = error.detail;
    throw wrapped;
  }
}
