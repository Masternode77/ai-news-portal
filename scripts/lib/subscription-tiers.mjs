export const SUBSCRIPTION_TIERS = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    audience: 'Readers tracking the live AI infrastructure signal board.',
    cta: 'Get the Daily Brief',
    href: '/subscribe/',
    features: {
      live_board: true,
      daily_brief: true,
      weekly_analyst_memo: false,
      premium_archive: 'Limited',
      saved_topics: false,
      pdf_downloads: false,
      market_maps: false,
      slack_teams_alerts: false,
      team_seats: '1',
      api_rss: 'Public RSS',
      monthly_briefing_call: false,
      custom_intelligence_requests: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 39,
    priceYearly: 399,
    audience: 'Operators, investors, and platform leaders who need weekly analysis.',
    cta: 'Start Pro',
    href: '/subscribe/pro/',
    features: {
      live_board: true,
      daily_brief: true,
      weekly_analyst_memo: true,
      premium_archive: true,
      saved_topics: true,
      pdf_downloads: true,
      market_maps: true,
      slack_teams_alerts: false,
      team_seats: '1',
      api_rss: 'Subscriber RSS',
      monthly_briefing_call: false,
      custom_intelligence_requests: false,
    },
  },
  {
    id: 'team',
    name: 'Team',
    priceMonthly: 299,
    priceYearly: null,
    audience: 'Infrastructure teams coordinating shared watchlists and alerts.',
    cta: 'Request Team Access',
    href: '/enterprise/request-demo/',
    features: {
      live_board: true,
      daily_brief: true,
      weekly_analyst_memo: true,
      premium_archive: true,
      saved_topics: true,
      pdf_downloads: true,
      market_maps: true,
      slack_teams_alerts: 'Placeholder',
      team_seats: '5 included',
      api_rss: 'Team RSS',
      monthly_briefing_call: false,
      custom_intelligence_requests: false,
    },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: null,
    priceYearly: null,
    audience: 'Capacity, capital, and policy teams that need custom intelligence.',
    cta: 'Request Enterprise Demo',
    href: '/enterprise/',
    features: {
      live_board: true,
      daily_brief: true,
      weekly_analyst_memo: true,
      premium_archive: true,
      saved_topics: true,
      pdf_downloads: true,
      market_maps: true,
      slack_teams_alerts: true,
      team_seats: 'Custom',
      api_rss: 'API/RSS',
      monthly_briefing_call: true,
      custom_intelligence_requests: true,
    },
  },
];

export const PRICING_FEATURES = [
  ['live_board', 'Live board'],
  ['daily_brief', 'Daily brief'],
  ['weekly_analyst_memo', 'Weekly analyst memo'],
  ['premium_archive', 'Premium archive'],
  ['saved_topics', 'Saved topics'],
  ['pdf_downloads', 'PDF downloads'],
  ['market_maps', 'Market maps'],
  ['slack_teams_alerts', 'Slack/Teams alerts'],
  ['team_seats', 'Team seats'],
  ['api_rss', 'API/RSS'],
  ['monthly_briefing_call', 'Monthly briefing call'],
  ['custom_intelligence_requests', 'Custom intelligence requests'],
];

export function tierById(id = 'free') {
  return SUBSCRIPTION_TIERS.find((tier) => tier.id === id) || SUBSCRIPTION_TIERS[0];
}

export function formatTierPrice(tier) {
  if (!tier || tier.id === 'enterprise') return 'Contact sales';
  if (tier.priceMonthly === 0) return '$0';
  return `$${tier.priceMonthly}/month`;
}
