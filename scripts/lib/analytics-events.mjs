export const ANALYTICS_EVENTS = [
  'newsletter_signup_view',
  'newsletter_signup_submit',
  'pricing_view',
  'pro_cta_click',
  'enterprise_cta_click',
  'advertise_cta_click',
  'media_kit_view',
  'sponsor_inquiry_submit',
  'report_view',
  'report_purchase_click',
  'directory_listing_request',
  'premium_article_preview_view',
  'paywall_cta_click',
];

export function isKnownAnalyticsEvent(eventName = '') {
  return ANALYTICS_EVENTS.includes(eventName);
}

export function buildAnalyticsPayload(eventName, payload = {}) {
  return {
    event: eventName,
    known: isKnownAnalyticsEvent(eventName),
    ts: new Date().toISOString(),
    ...payload,
  };
}

export const ANALYTICS_ENV_VARS = [
  'PUBLIC_GA4_ID',
  'PUBLIC_PLAUSIBLE_DOMAIN',
];
