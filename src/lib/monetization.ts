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

const env = import.meta.env as Record<string, unknown>;
const clean = (value: unknown): string => String(value ?? '').trim();

export const ADSENSE_CLIENT = clean(env.PUBLIC_ADSENSE_CLIENT);
export const GA4_ID = clean(env.PUBLIC_GA4_ID);

export const ADSENSE_SLOTS: Record<string, string> = {
  leaderboard: clean(env.PUBLIC_ADSENSE_SLOT_LEADERBOARD),
  infeed: clean(env.PUBLIC_ADSENSE_SLOT_INFEED),
  article: clean(env.PUBLIC_ADSENSE_SLOT_ARTICLE),
  box: clean(env.PUBLIC_ADSENSE_SLOT_BOX),
};

export const adsEnabled = /^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT);
export const analyticsEnabled = /^G-[A-Z0-9]{4,16}$/i.test(GA4_ID);
export const consentRequired = adsEnabled || analyticsEnabled;

// ads.txt uses the bare pub- prefix, without the ca- namespace.
export const adsensePubId = adsEnabled ? ADSENSE_CLIENT.replace(/^ca-/, '') : '';

export const slotFor = (variant: string): string => ADSENSE_SLOTS[variant] || '';
