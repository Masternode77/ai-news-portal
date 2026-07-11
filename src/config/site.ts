export const SITE = {
  name: 'Compute Current',
  shortName: 'Compute Current',
  domain: 'www.computecurrent.com',
  rootDomain: 'computecurrent.com',
  url: 'https://www.computecurrent.com',
  tagline: 'AI infrastructure, data center, semiconductor, and power intelligence, refreshed every 8 hours.',
  description:
    'Decision-grade intelligence on AI infrastructure, data centers, semiconductors, cloud capacity, cooling, power grids, and capital flows.',
  defaultOgImage: '/og-default.svg',
  rssPath: '/rss.xml',
  contactEmail: 'briefings@computecurrent.com',
  commercial: {
    routes: {
      subscribe: '/subscribe/',
      pricing: '/pricing/',
      sample: '/sample/',
      briefing: '/briefing/',
      archive: '/archive/',
      rss: '/rss.xml',
    },
    ctas: {
      weeklyBrief: 'Read the latest',
      sample: 'Read a sample',
      executiveBriefing: 'Read the briefing',
      recentAnalysis: 'Browse the archive',
    },
    packages: [
      {
        name: 'Recent intelligence',
        price: 'Open',
        summary: 'Source-linked analysis for readers tracking AI infrastructure constraints.',
      },
      {
        name: 'Source Trail',
        price: 'Open',
        summary: 'Source-linked context, provenance labels, and archive paths for every published analysis.',
      },
      {
        name: 'Constraint Watchlists',
        price: 'Open',
        summary: 'Power, capacity, silicon, cooling, capital, and policy lanes organized for fast scanning.',
      },
      {
        name: 'Company & Regional Views',
        price: 'Open',
        summary: 'Published infrastructure signals organized by company, market, and region.',
      },
    ],
  },
};
