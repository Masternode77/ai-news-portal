export const REPORTS = [
  {
    slug: 'ai-data-center-power-constraint-index',
    title: 'AI Data Center Power Constraint Index',
    price: '$495',
    status: 'Preview available',
    category: 'Power & Grid',
    executive_summary: 'A market-by-market view of where AI data center growth is most exposed to power availability, interconnection delay, and utility cost allocation.',
    toc: ['Constraint framework', 'Regional risk signals', 'Utility and interconnection indicators', 'Buyer implications'],
  },
  {
    slug: 'liquid-cooling-readiness-report',
    title: 'Liquid Cooling Readiness Report',
    price: '$395',
    status: 'Request report',
    category: 'Cooling & Thermal',
    executive_summary: 'A readiness map for liquid cooling adoption across facilities, silicon roadmaps, procurement cycles, and operational staffing.',
    toc: ['Thermal load drivers', 'Facility readiness', 'Vendor landscape', 'Procurement checklist'],
  },
  {
    slug: 'ai-infrastructure-capital-flow-monitor',
    title: 'AI Infrastructure Capital Flow Monitor',
    price: '$595',
    status: 'Preview available',
    category: 'Capital & Deals',
    executive_summary: 'A deal monitor for capital formation, debt structures, GPU cloud financing, data center M&A, and capacity-backed contracts.',
    toc: ['Capital stack', 'Deal quality signals', 'Counterparty exposure', 'Watchlist'],
  },
  {
    slug: 'data-center-siting-permitting-risk-map',
    title: 'Data Center Siting and Permitting Risk Map',
    price: '$495',
    status: 'Request report',
    category: 'Policy & Siting',
    executive_summary: 'A siting and permitting risk map for data center developers, power stakeholders, investors, and regional policy teams.',
    toc: ['Local approval risks', 'Grid constraints', 'Community exposure', 'Mitigation signals'],
  },
  {
    slug: 'semiconductor-supply-constraint-watch',
    title: 'Semiconductor Supply Constraint Watch',
    price: '$395',
    status: 'Request report',
    category: 'Silicon & Systems',
    executive_summary: 'A watchlist for AI accelerator, HBM, packaging, networking, and server supply constraints that can slow deployment.',
    toc: ['Silicon layer', 'Memory and packaging', 'System integration', 'Procurement implications'],
  },
  {
    slug: 'ai-inference-capacity-outlook',
    title: 'AI Inference Capacity Outlook',
    price: '$495',
    status: 'Preview available',
    category: 'Cloud Capacity',
    executive_summary: 'A forward look at inference demand, cloud capacity pressure, regional deployment patterns, and buyer exposure.',
    toc: ['Demand signals', 'Capacity allocation', 'Regional outlook', 'Enterprise buyer actions'],
  },
];

export function allReports() {
  return REPORTS;
}

export function reportBySlug(slug) {
  return REPORTS.find((report) => report.slug === slug) || null;
}
