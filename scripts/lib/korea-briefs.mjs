const SUMMARY_LICENSES = new Set(['KOGL-1']);
const LINK_ONLY_LICENSES = new Set(['KOGL-2', 'KOGL-3', 'KOGL-4', 'unknown']);

function validDate(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function hasItemEvidence(record) {
  try {
    const source = new URL(record.sourceUrl);
    const evidence = new URL(record.license?.evidenceUrl);
    return source.protocol === 'https:'
      && evidence.protocol === 'https:'
      && source.href === evidence.href;
  } catch {
    return false;
  }
}

export function assessKoreaBrief(record, now = new Date()) {
  const nowMs = now.getTime();
  const publishedMs = validDate(record.publishedAt);
  const reviewedMs = validDate(record.review?.approvedAt);
  const expiresMs = validDate(record.review?.expiresAt);
  const requiredText = [record.id, record.title, record.source, record.organization, record.sourceUrl];

  if (requiredText.some((value) => typeof value !== 'string' || !value.trim())) {
    return { status: 'blocked', reason: 'missing_required_field' };
  }
  if (!publishedMs || publishedMs > nowMs) return { status: 'blocked', reason: 'invalid_or_future_publication_date' };
  if (record.review?.status !== 'approved' || record.review?.method !== 'manual') {
    return { status: 'blocked', reason: 'manual_review_not_approved' };
  }
  if (!reviewedMs || reviewedMs > nowMs || !expiresMs || expiresMs <= nowMs) {
    return { status: 'blocked', reason: 'invalid_or_expired_rights_review' };
  }
  if (!hasItemEvidence(record)) return { status: 'blocked', reason: 'missing_item_specific_license_evidence' };
  if (record.license?.scope !== 'text-only' || record.mediaIncluded !== false) {
    return { status: 'blocked', reason: 'media_or_non_text_scope_not_allowed' };
  }

  const licenseType = record.license?.type || 'unknown';
  if (SUMMARY_LICENSES.has(licenseType)) {
    if (typeof record.summary !== 'string' || !record.summary.trim()) {
      return { status: 'blocked', reason: 'approved_summary_missing' };
    }
    return { status: 'summary', reason: 'item_specific_kogl_type_1' };
  }
  if (LINK_ONLY_LICENSES.has(licenseType)) return { status: 'link_only', reason: 'summary_rights_not_established' };
  return { status: 'blocked', reason: 'unsupported_license_type' };
}

export function getPublishedKoreaBriefs(records, options = {}) {
  const now = options.now || new Date();
  return records
    .map((record) => ({ record, decision: assessKoreaBrief(record, now) }))
    .filter(({ decision }) => decision.status !== 'blocked')
    .map(({ record, decision }) => ({
      ...record,
      summary: decision.status === 'summary' ? record.summary.trim() : '',
      publicationMode: decision.status,
    }))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export function buildKoreaBriefRssItems(records, options = {}) {
  return getPublishedKoreaBriefs(records, options).map((record) => ({
    title: record.title,
    link: record.sourceUrl,
    pubDate: new Date(record.publishedAt),
    description: record.summary || `${record.organization} 원문 링크`,
    categories: ['한국', record.topic],
    customData: `<source>${record.source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</source>`,
  }));
}
