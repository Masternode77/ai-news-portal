export const NEWSLETTER_INTERESTS = [
  'Power & Grid',
  'Data Centers',
  'Cooling',
  'Silicon & Systems',
  'Cloud Capacity',
  'Capital & Deals',
  'Policy & Siting',
  'Enterprise Infrastructure',
];

export const ROLE_SEGMENTS = [
  'Data center operator',
  'Cloud capacity team',
  'Investor',
  'Power or grid stakeholder',
  'Infrastructure vendor',
  'Enterprise buyer',
  'Policy or siting professional',
  'Other',
];

export function normalizeNewsletterLead(lead = {}) {
  const email = String(lead.email || '').trim().toLowerCase();
  const interests = Array.isArray(lead.interests)
    ? lead.interests.filter((interest) => NEWSLETTER_INTERESTS.includes(interest))
    : [];

  return {
    email,
    role: String(lead.role || '').trim(),
    company: String(lead.company || '').trim(),
    interests,
    source: String(lead.source || 'site').trim(),
    created_at: lead.created_at || new Date().toISOString(),
  };
}

export function segmentNewsletterLead(lead = {}) {
  const normalized = normalizeNewsletterLead(lead);
  const segments = new Set();
  for (const interest of normalized.interests) {
    segments.add(interest.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  }
  if (/invest/i.test(normalized.role)) segments.add('investor');
  if (/operator|data center/i.test(normalized.role)) segments.add('operator');
  if (/cloud|capacity/i.test(normalized.role)) segments.add('cloud_capacity');
  return { ...normalized, segments: [...segments] };
}
