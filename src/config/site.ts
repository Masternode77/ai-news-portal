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
      weeklyBrief: 'Open the Signal Board',
      sample: 'Read the Sample Analysis',
      executiveBriefing: 'Trace the Methodology',
      recentAnalysis: 'Browse recent analysis',
      contact: 'Send a Source Signal',
    },
    packages: [
      {
        name: 'Public Signal Board',
        price: 'Open',
        summary: 'Live public signals for readers tracking AI infrastructure constraints.',
      },
      {
        name: 'Source Trail',
        price: 'Open',
        summary: 'Source-linked context, provenance labels, and archive paths for every released signal.',
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
