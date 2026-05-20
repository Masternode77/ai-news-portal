export const ANALYTICS_EVENTS = [
  'newsletter_signup_view',
  'newsletter_signup_submit',
  'article_view',
  'source_click',
  'local_article_click',
  'homepage_lane_view',
  'archive_search',
];

export function analyticsEnabled() {
  return Boolean(process.env.VERCEL || process.env.PUBLIC_ANALYTICS_ENABLED === '1');
}

export function analyticsEventPayload(name, properties = {}) {
  return {
    name,
    enabled: analyticsEnabled(),
    properties,
    createdAt: new Date().toISOString(),
  };
}
