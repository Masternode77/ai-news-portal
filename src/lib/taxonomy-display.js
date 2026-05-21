const LEGACY_CATEGORY_MAP = {
  'Hyperscalers & Cloud': {
    primary: 'Cloud Capacity',
    secondary: 'Hyperscale and cloud capacity',
    layer: 'Cloud Platform',
  },
  'Colocation & Wholesale': {
    primary: 'Data Centers',
    secondary: 'Colocation and wholesale capacity',
    layer: 'Facility',
  },
  'AI Infrastructure (GPU/Neocloud)': {
    primary: 'AI Infrastructure',
    secondary: 'GPU clusters and neocloud capacity',
    layer: 'Compute',
  },
  'Power / Grid / Energy': {
    primary: 'Power & Grid',
    secondary: 'Power procurement and grid access',
    layer: 'Power',
  },
  'Cooling / MEP / Engineering': {
    primary: 'Cooling & Facility Engineering',
    secondary: 'Thermal design and MEP readiness',
    layer: 'Cooling',
  },
  'Market / M&A / Financing': {
    primary: 'Capital Markets',
    secondary: 'Financing and capital structure',
    layer: 'Capital',
  },
  'APAC + Policy/Regulation': {
    primary: 'Policy & Siting',
    secondary: 'Regional policy and market access',
    layer: 'Policy',
  },
};

export function taxonomyDisplay(article = {}) {
  const legacy = LEGACY_CATEGORY_MAP[article.category] || {};
  return {
    primary: article.primary_category || legacy.primary || article.category || 'Infrastructure',
    secondary: article.secondary_category || legacy.secondary || article.infrastructure_layer || '',
    layer: article.infrastructure_layer || legacy.layer || 'Infrastructure',
    articleType: article.article_type || 'Signal',
    region: article.region || 'Global',
    stakeholders: Array.isArray(article.affected_stakeholders) ? article.affected_stakeholders.slice(0, 3) : [],
    urgency: Number.isFinite(Number(article.urgency_score)) ? Number(article.urgency_score) : null,
  };
}

export function urgencyLabel(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= 0.75) return 'High urgency';
  if (score >= 0.45) return 'Watch';
  return 'Monitor';
}
