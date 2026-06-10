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
    },
    ctas: {
      weeklyBrief: 'Get the Weekly Brief',
      sample: 'Request a Sample',
      executiveBriefing: 'Executive Briefing',
      recentAnalysis: 'Browse recent analysis',
      contact: 'Request a Briefing',
    },
    packages: [
      {
        name: 'Free Briefing Notes',
        price: 'Free',
        summary: 'Public highlights and short signals for readers tracking AI infrastructure.',
      },
      {
        name: 'Pro Weekly Brief',
        price: '$99/month',
        annualPrice: '$999/year',
        summary: 'Weekly decision memo on power, capacity, chips, cooling, capital, and cloud demand.',
      },
      {
        name: 'Team Intelligence',
        price: 'Starts at $1,500/month',
        summary: 'Shared team distribution, watchlists, and monthly intelligence notes.',
      },
      {
        name: 'Custom Executive Briefing',
        price: '$3,000-$10,000/month pilot range',
        summary: 'Custom memos and executive calls for investors, operators, developers, and strategy teams.',
      },
    ],
  },
};
