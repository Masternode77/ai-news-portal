import { isEmergencyQualityModeEnabled } from './emergency-quality-mode.mjs';

function uniqueReasons(reasons = []) {
  return [...new Set((Array.isArray(reasons) ? reasons : [reasons])
    .flat()
    .filter(Boolean)
    .map((reason) => String(reason)))];
}

export function isQuarantinedArticle(article = {}) {
  return article.public_status === 'quarantined'
    || article.quarantined === true
    || Array.isArray(article.quarantine_reason);
}

export function publicVisibilityBlocked(article = {}) {
  return isQuarantinedArticle(article)
    || article.public_status === 'archive_only_noindex'
    || article.archiveOnly === true
    || article.infrastructure_relevance_action === 'archive_only'
    || article.homepagePublished === false;
}

export function quarantineArticle(article = {}, reasons = [], options = {}) {
  const mergedReasons = uniqueReasons([
    ...(article.quarantine_reason || []),
    ...uniqueReasons(reasons),
  ]);
  const modeEnabled = options.force === true || isEmergencyQualityModeEnabled(options.env || process.env);
  if (!modeEnabled) return article;
  return {
    ...article,
    public_status: 'quarantined',
    quarantined: true,
    homepagePublished: false,
    articlePagePublished: false,
    archiveOnly: true,
    signalCardOnly: false,
    noindex: true,
    seo_noindex: true,
    seo_noindex_reasons: uniqueReasons([
      ...(article.seo_noindex_reasons || []),
      'emergency_quality_quarantine',
      ...mergedReasons,
    ]),
    quarantine_reason: mergedReasons.length ? mergedReasons : ['emergency_quality_quarantine'],
    routing_decision: 'quarantine',
    public_routing: {
      ...(article.public_routing || {}),
      visibility: 'archive',
      laneKey: 'archive-only',
      laneTitle: 'Archive Only',
      public_signal_label: 'Adjacent Signal',
      editorial_lens: 'Quarantined',
      routing_decision: 'quarantine',
      blocked_reasons: mergedReasons.length ? mergedReasons : ['emergency_quality_quarantine'],
    },
  };
}

export function archiveOnlyNoindexArticle(article = {}, reasons = []) {
  const mergedReasons = uniqueReasons(reasons);
  return {
    ...article,
    public_status: 'archive_only_noindex',
    homepagePublished: false,
    articlePagePublished: false,
    archiveOnly: true,
    signalCardOnly: false,
    noindex: true,
    seo_noindex: true,
    seo_noindex_reasons: uniqueReasons([
      ...(article.seo_noindex_reasons || []),
      'archive_only_noindex',
      ...mergedReasons,
    ]),
    archiveOnlyReason: mergedReasons.join('; ') || 'archive_only_noindex',
    routing_decision: 'archive_only_noindex',
    public_routing: {
      ...(article.public_routing || {}),
      visibility: 'archive',
      laneKey: 'archive-only',
      laneTitle: 'Archive Only',
      public_signal_label: 'Adjacent Signal',
      editorial_lens: 'Archive Only',
      routing_decision: 'archive_only_noindex',
      blocked_reasons: mergedReasons.length ? mergedReasons : ['archive_only_noindex'],
    },
  };
}
