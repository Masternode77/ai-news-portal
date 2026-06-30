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
      contact: '/contact/',
      archive: '/archive/',
      methodology: '/methodology/',
      editorialPolicy: '/editorial-policy/',
      aiDisclosure: '/ai-disclosure/',
      rss: '/rss.xml',
    },
    ctas: {
      weeklyBrief: 'Read the latest',
      sample: 'Editorial policy',
      executiveBriefing: 'How we source',
      recentAnalysis: 'Browse the archive',
      contact: 'Share a source',
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
        name: 'Editorial Method',
        price: 'Open',
        summary: 'Public rules for source selection, AI assistance, image provenance, and quality gates.',
      },
    ],
  },
};
