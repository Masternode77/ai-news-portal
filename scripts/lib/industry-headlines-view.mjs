// Reader-facing helpers for the industry radar. Kept free of network and
// parser imports so Astro pages can use them cheaply.
export const HEADLINE_VIEW_MAX_AGE_HOURS = 7 * 24;
export const LINK_ONLY_BASES = new Set(['feed_listing_permitted', 'feed_listing_low_risk']);
const BLOCKED_STATUSES = new Set(['blocked', 'paywalled', 'extraction_failed']);
const REVIEW_WINDOW_DAYS = 365;

// The registry gate for the headline lane, shared by the refresh and by the
// pages: a recorded link-only verdict, an active https feed, no text
// authorization and a review inside the window. Removing a row's
// link_only_basis therefore drops its headlines on the next build, before the
// next refresh runs.
export function linkOnlyHeadlineSourceEligible(row = {}, now = new Date()) {
  if (!LINK_ONLY_BASES.has(String(row.link_only_basis || '').trim())) return false;
  if (row.status !== 'active_feed' || BLOCKED_STATUSES.has(row.status)) return false;
  if (row.allow_text_use === true || String(row.allow_text_use) === 'true') return false;
  const reviewed = Date.parse(String(row.reviewed_at || ''));
  if (!Number.isFinite(reviewed) || reviewed > now.getTime()) return false;
  if (now.getTime() - reviewed > REVIEW_WINDOW_DAYS * 86_400_000) return false;
  try {
    const feed = new URL(String(row.feed || '').trim());
    return feed.protocol === 'https:' && !feed.username && !feed.password;
  } catch {
    return false;
  }
}

export function eligibleHeadlineSourceIds(sources = [], now = new Date()) {
  return new Set((Array.isArray(sources) ? sources : [])
    .filter((row) => linkOnlyHeadlineSourceEligible(row, now))
    .map((row) => String(row.id || '').trim()));
}

export const SEGMENT_LABELS = {
  ai_companies: 'AI companies',
  chips: 'Chips & hardware',
  it_infrastructure: 'IT & network infrastructure',
  cloud: 'Cloud providers',
  data_centers: 'Data centers',
  power_cooling: 'Power & cooling',
};

// Headlines in one language, newest first (the stored order), inside the age
// window, optionally limited to those naming one company.
export function headlinesFor(data = {}, { language = 'en', limit = 12, maxAgeHours = HEADLINE_VIEW_MAX_AGE_HOURS, now = new Date(), company = '', sourceIds = null } = {}) {
  const cutoff = now.getTime() - maxAgeHours * 3_600_000;
  return (Array.isArray(data?.items) ? data.items : [])
    .filter((item) => item.language === language && Date.parse(item.publishedAt) >= cutoff)
    .filter((item) => !sourceIds || sourceIds.has(item.sourceRegistryId))
    .filter((item) => !company || (item.companies || []).some((entry) => String(entry.name).toLowerCase() === String(company).toLowerCase()))
    .slice(0, limit);
}

export function headlinesBySegment(items = []) {
  const groups = new Map(Object.keys(SEGMENT_LABELS).map((segment) => [segment, []]));
  for (const item of items) {
    if (!groups.has(item.segment)) groups.set(item.segment, []);
    groups.get(item.segment).push(item);
  }
  return [...groups.entries()]
    .filter(([, entries]) => entries.length)
    .map(([segment, entries]) => ({ segment, label: SEGMENT_LABELS[segment] || 'Other infrastructure', items: entries }));
}
