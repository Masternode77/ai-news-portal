// Reader-facing helpers for the industry radar. Kept free of network and
// parser imports so Astro pages can use them cheaply.
export const HEADLINE_VIEW_MAX_AGE_HOURS = 7 * 24;

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
export function headlinesFor(data = {}, { language = 'en', limit = 12, maxAgeHours = HEADLINE_VIEW_MAX_AGE_HOURS, now = new Date(), company = '' } = {}) {
  const cutoff = now.getTime() - maxAgeHours * 3_600_000;
  return (Array.isArray(data?.items) ? data.items : [])
    .filter((item) => item.language === language && Date.parse(item.publishedAt) >= cutoff)
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
