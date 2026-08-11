import { createHash } from 'node:crypto';
import { validateExtractionArtifact } from './extraction-artifact.mjs';
import { safeHttpUrl } from './normalize.mjs';
import { loadSourceRegistrySync, sourceUsageDecision } from './source-registry.mjs';

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalizedUrl(value = '') {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = '';
  return url;
}

function registrySnapshot(source = {}) {
  return {
    id: source.id,
    domain: source.domain,
    status: source.status,
    text_use_basis: source.text_use_basis,
    terms_url: source.terms_url,
    reviewed_at: source.reviewed_at,
    allow_text_use: source.allow_text_use,
  };
}

function denied(detail, checkedAt, extra = {}) {
  return {
    ok: false,
    authorized: false,
    reason: 'text_use_not_authorized',
    detail,
    sourceId: '',
    reviewedAt: '',
    termsUrl: '',
    checkedAt,
    registryDigest: '',
    registryBlobSha: '',
    contentDigest: '',
    ...extra,
  };
}

function registryFrom(options = {}) {
  if (options.sourceRegistry !== undefined) {
    return Array.isArray(options.sourceRegistry)
      ? { ok: true, sources: options.sourceRegistry }
      : { ok: false, sources: [] };
  }
  try {
    return { ok: true, sources: loadSourceRegistrySync(options.sourceRegistryPath) };
  } catch {
    return { ok: false, sources: [] };
  }
}

export function currentSourceTextAuthorization(article = {}, artifact = {}, options = {}) {
  const checkedDate = new Date(options.now || new Date());
  const checkedAt = Number.isFinite(checkedDate.getTime()) ? checkedDate.toISOString() : '';
  if (!checkedAt) return denied('decision_time_invalid', checkedAt);

  const artifactValidation = validateExtractionArtifact(artifact);
  if (!artifactValidation.ok) {
    return denied('extraction_artifact_invalid', checkedAt, {
      artifactReasons: artifactValidation.reasons,
    });
  }

  const loaded = registryFrom(options);
  if (!loaded.ok) return denied('registry_unreadable', checkedAt);

  const sourceId = String(article.sourceRegistryId || article.source_id || '').trim();
  if (!sourceId) return denied('source_registry_id_missing', checkedAt);
  const source = loaded.sources.find((candidate) => String(candidate.id || '').trim() === sourceId);
  if (!source) return denied('source_not_registered', checkedAt, { sourceId });
  if (source.status !== 'active_feed') return denied('source_inactive', checkedAt, { sourceId });

  const decision = sourceUsageDecision({ sourceRegistryId: sourceId }, loaded.sources, 'text', checkedDate);
  if (!decision.authorized || decision.sourceId !== sourceId) {
    return denied(decision.detail || 'source_not_registered', checkedAt, { sourceId });
  }

  const articleUrl = normalizedUrl(article.sourceUrl || article.canonicalUrl || article.url || article.link);
  if (!articleUrl) return denied('article_source_url_malformed', checkedAt, { sourceId });
  const artifactUrl = normalizedUrl(artifactValidation.sourceUrl);
  if (!artifactUrl) return denied('artifact_source_url_malformed', checkedAt, { sourceId });
  const registryHost = String(source.domain || '').trim().toLowerCase().replace(/^www\./, '');
  if (!registryHost) return denied('registry_domain_missing', checkedAt, { sourceId });
  const articleHost = articleUrl.hostname.toLowerCase().replace(/^www\./, '');
  const artifactHost = artifactUrl.hostname.toLowerCase().replace(/^www\./, '');
  if (articleHost !== registryHost) return denied('article_source_domain_mismatch', checkedAt, { sourceId });
  if (artifactHost !== registryHost) return denied('artifact_source_domain_mismatch', checkedAt, { sourceId });
  if (articleUrl.href !== artifactUrl.href) return denied('article_artifact_url_mismatch', checkedAt, { sourceId });

  return {
    ok: true,
    authorized: true,
    reason: '',
    detail: '',
    sourceId,
    reviewedAt: String(source.reviewed_at || ''),
    termsUrl: String(source.terms_url || ''),
    checkedAt,
    registryDigest: sha256(JSON.stringify(loaded.sources.map(registrySnapshot))),
    registryBlobSha: String(options.sourceRegistrySha || ''),
    contentDigest: String(artifact.extracted_text_sha256 || ''),
  };
}

export function sourceTextAuthorizationSnapshot(decision = {}) {
  const reasons = decision.ok ? [] : [`source_rights:${decision.detail || 'text_use_not_authorized'}`];
  return {
    ok: decision.ok === true,
    reasons,
    checked_gates: ['current_source_text_authorization'],
    source_text_authorization: decision,
  };
}
