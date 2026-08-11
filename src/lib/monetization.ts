// Central monetization configuration.
//
// Everything is driven by PUBLIC_* environment variables so that ads and
// analytics stay completely disabled (zero external requests, zero markup)
// until real IDs are configured in the deployment platform. Set the values
// in Vercel (Production env), redeploy, and the integrations go live.
//
//   PUBLIC_ADSENSE_CLIENT            ca-pub-XXXXXXXXXXXXXXXX (AdSense publisher ID)
//   PUBLIC_ADSENSE_SLOT_LEADERBOARD  numeric slot id for the homepage leaderboard unit
//   PUBLIC_ADSENSE_SLOT_INFEED       numeric slot id for feed-embedded units
//   PUBLIC_ADSENSE_SLOT_ARTICLE      numeric slot id for in-article units
//   PUBLIC_ADSENSE_SLOT_BOX          numeric slot id for box/footer units
//   PUBLIC_GA4_ID                    G-XXXXXXXXXX (Google Analytics 4 measurement ID)

import latestNews from '../data/latest-news.json';
import archivedNews from '../data/archived-news.json';
import { currentPublicDetailInventory } from './monetization-inventory.mjs';

const env = import.meta.env as Record<string, unknown>;
const clean = (value: unknown): string => String(value ?? '').trim();

export const verifiedPublicDetailCount = currentPublicDetailInventory([...latestNews, ...archivedNews]).length;

export const ADSENSE_CLIENT = clean(env.PUBLIC_ADSENSE_CLIENT);
export const GA4_ID = clean(env.PUBLIC_GA4_ID);

export const ADSENSE_SLOTS: Record<string, string> = {
  leaderboard: clean(env.PUBLIC_ADSENSE_SLOT_LEADERBOARD),
  infeed: clean(env.PUBLIC_ADSENSE_SLOT_INFEED),
  article: clean(env.PUBLIC_ADSENSE_SLOT_ARTICLE),
  box: clean(env.PUBLIC_ADSENSE_SLOT_BOX),
};

export const adsConfigured = /^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT);
export const analyticsConfigured = /^G-[A-Z0-9]{4,16}$/i.test(GA4_ID);

// This is an explicit deployment attestation, not a local consent mechanism.
// It must remain true until a certified CMP is configured externally.
export const googleCmpReady = clean(env.PUBLIC_GOOGLE_CMP_READY).toLowerCase() === 'true';
export const adsenseContentReady = clean(env.PUBLIC_ADSENSE_CONTENT_READY).toLowerCase() === 'true';

// Existing ad surfaces stay off until CMP and content attestations are present;
// route-specific activation remains the Layout's responsibility.
export const adsEnabled = adsConfigured && googleCmpReady && adsenseContentReady && verifiedPublicDetailCount > 0;
export const analyticsEnabled = analyticsConfigured && googleCmpReady;

export const MONETIZATION_DENIED_PATHS = [
  '/privacy',
  '/terms',
  '/contact',
  '/follow',
  '/about',
  '/ads.txt',
  '/robots.txt',
  '/rss.xml',
  '/sitemap.xml',
] as const;

export const MONETIZATION_DENIED_PREFIXES = ['/admin/', '/api/'] as const;
export const MONETIZABLE_ROUTE_PREFIXES = ['/archive/', '/news/', '/category/', '/company/', '/region/'] as const;

const normalizePathname = (pathname: string): string => {
  const pathWithoutQuery = clean(pathname).split(/[?#]/, 1)[0] || '';
  return pathWithoutQuery.replace(/\/+$/, '') || '/';
};

const matchesRoutePrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix.slice(0, -1) || pathname.startsWith(prefix);

export const isMonetizableRoute = (pathname: string): boolean => {
  const normalizedPathname = normalizePathname(pathname);
  if (MONETIZATION_DENIED_PATHS.some((deniedPath) => deniedPath === normalizedPathname)) {
    return false;
  }
  if (MONETIZATION_DENIED_PREFIXES.some((prefix) => matchesRoutePrefix(normalizedPathname, prefix))) {
    return false;
  }
  return normalizedPathname === '/' || MONETIZABLE_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(normalizedPathname, prefix));
};

export const isAdsActiveForRoute = (pathname: string): boolean =>
  adsEnabled && isMonetizableRoute(pathname);

export const isAnalyticsActiveForRoute = (pathname: string): boolean =>
  analyticsEnabled && isMonetizableRoute(pathname);

export const isMonetizationActiveForRoute = (pathname: string): boolean =>
  googleCmpReady && isMonetizableRoute(pathname) && (adsConfigured || analyticsConfigured);

// ads.txt uses the bare pub- prefix, without the ca- namespace.
export const adsensePubId = adsConfigured ? ADSENSE_CLIENT.replace(/^ca-/, '') : '';

export const slotFor = (variant: string): string => ADSENSE_SLOTS[variant] || '';
