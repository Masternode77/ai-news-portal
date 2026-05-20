export function isQuarantinedOrArchiveOnly(item = {}) {
  return item.public_status === 'quarantined'
    || item.public_status === 'archive_only_noindex'
    || item.archiveOnly === true
    || item.public_publish_blocked === true;
}

export function isIndexableLocalArticle(item = {}) {
  return Boolean(item?.id)
    && item.articlePagePublished !== false
    && item.signalCardOnly !== true
    && !isQuarantinedOrArchiveOnly(item)
    && item.noindex !== true
    && item.seo_noindex !== true;
}

export function isUsefulRssItem(item = {}) {
  if (isIndexableLocalArticle(item)) return true;
  if (item.public_route === 'Short Signal' && item.homepagePublished !== false && item.noindex !== true) return true;
  return false;
}

export function canonicalForArticle(item = {}, site = 'https://www.computecurrent.com') {
  return `${site.replace(/\/$/, '')}/news/${item.id}/`;
}

export function searchIndexEligible(item = {}) {
  return isIndexableLocalArticle(item);
}
