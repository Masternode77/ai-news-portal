import { sourceScopePolicyResult } from './source-scope-policy.mjs';

export const TONE_LIBRARY_V3 = [
  'Board-level strategist',
  'Infrastructure operator',
  'Investor analyst',
  'Technical explainer',
  'Skeptical columnist',
  'Market cartographer',
  'Procurement advisor',
  'Policy risk analyst',
  'Deal memo writer',
  'Field note reporter',
];

export const ARCHETYPE_LIBRARY_V3 = [
  'Operator Field Note',
  'Investor Memo',
  'Technical Explainer',
  'Market Map',
  'Policy / Local Risk Note',
  "Skeptic's Read",
  'Board-Level Briefing',
  'Blog Analysis Essay',
  'Supply Chain Fault Line',
  'Power Market Signal',
  'Memory Economics Brief',
  'Platform Resilience Note',
  'Cloud Product Read',
  'Enterprise Platform Note',
  'Adjacent Watchlist',
  'Source Watch',
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sourceText(article = {}) {
  return compact([
    article.title,
    article.summary,
    article.snippet,
    article.cleaned_source_text,
    article.source_evidence_text,
    article.rawText,
  ].filter(Boolean).join(' '));
}

function has(text = '', pattern) {
  return pattern.test(text);
}

export function infrastructureConstraint(article = {}) {
  const text = sourceText(article);
  if (has(text, /\b(power|grid|utility|substation|interconnection|MW|GW|nuclear|energy)\b/i)) return 'power and grid access';
  if (has(text, /\b(cooling|liquid cooling|thermal|CDU|rack density|MEP)\b/i)) return 'cooling and facility engineering';
  if (has(text, /\b(gpu|accelerator|hbm|memory|semiconductor|chip|epyc|xeon|processor)\b/i)) return 'silicon and systems supply';
  if (has(text, /\b(region|availability zone|cloud|azure|aws|google cloud|sovereign cloud)\b/i)) return 'cloud platform availability';
  if (has(text, /\b(capital|debt|equity|lease|IPO|REIT|financing|valuation)\b/i)) return 'capital formation and lease risk';
  if (has(text, /\b(permit|zoning|siting|governor|commission|policy|regulation)\b/i)) return 'policy and siting risk';
  if (has(text, /\b(storage|backup|data management|resilience|recovery)\b/i)) return 'enterprise data infrastructure';
  return compact(article.infrastructure_layer || article.primary_category || 'AI infrastructure planning').toLowerCase();
}

function stakeholderSet(article = {}, constraint = '') {
  if (/power|grid|siting|facility|data center/.test(constraint)) return ['operators', 'utilities', 'site-selection teams', 'infrastructure investors'];
  if (/silicon|systems|memory/.test(constraint)) return ['platform architects', 'server buyers', 'supply-chain teams', 'infrastructure investors'];
  if (/cloud|enterprise|data/.test(constraint)) return ['enterprise buyers', 'platform teams', 'security reviewers', 'cloud architects'];
  if (/capital/.test(constraint)) return ['investors', 'developers', 'lenders', 'capacity buyers'];
  return ['operators', 'capacity planners', 'cloud buyers', 'infrastructure investors'];
}

function routeFor(article = {}, policy = sourceScopePolicyResult(article)) {
  const score = Number(article.infrastructure_relevance_score || 0);
  if (policy.force_non_core_signal) return policy.public_route;
  if (score >= 0.92) return 'Core Longform Blog';
  if (score >= 0.76) return 'Standard Blog';
  if (score >= 0.62) return 'Expert Brief';
  if (score >= 0.5) return 'Short Signal';
  return 'Source Card';
}

function signalLabelFor(route = '') {
  if (route === 'Core Longform Blog') return 'Core Signal';
  if (route === 'Standard Blog') return 'Standard Brief';
  return route;
}

function categoryFor(article = {}, constraint = '', policy = sourceScopePolicyResult(article)) {
  if (policy.force_non_cloud_capacity) return policy.public_route === 'Cloud Product Read'
    ? 'Enterprise AI Infrastructure'
    : article.primary_category === 'Cloud Capacity'
      ? 'Enterprise AI Infrastructure'
      : article.primary_category || 'AI Infrastructure';
  if (/power|grid/.test(constraint)) return 'Power & Grid';
  if (/cooling|facility|siting|data center/.test(constraint)) return 'Data Centers';
  if (/silicon|systems|memory/.test(constraint)) return 'Semiconductors';
  if (/cloud/.test(constraint)) return 'Cloud Capacity';
  if (/capital/.test(constraint)) return 'Capital Markets';
  return article.primary_category || article.category || 'AI Infrastructure';
}

export function planEditorialAngleV3(article = {}, options = {}) {
  const index = Number(options.index || 0);
  const policy = sourceScopePolicyResult(article);
  const constraint = infrastructureConstraint(article);
  const route = routeFor(article, policy);
  const tone = TONE_LIBRARY_V3[index % TONE_LIBRARY_V3.length];
  const archetype = policy.force_non_core_signal
    ? policy.public_route
    : ARCHETYPE_LIBRARY_V3[index % 12];
  const stakeholders = stakeholderSet(article, constraint);
  const sourceTitle = compact(article.title || 'the reported update');
  const thesis = policy.force_non_core_signal
    ? `${sourceTitle} is useful as a ${route.toLowerCase()} because it can change enterprise planning work without proving a capacity milestone.`
    : `${sourceTitle} matters because it puts ${constraint} back into the decision path for ${stakeholders.slice(0, 2).join(' and ')}.`;

  return {
    route,
    public_signal_label: signalLabelFor(route),
    editorial_lens: archetype,
    tone,
    archetype,
    constraint,
    stakeholders,
    thesis,
    category: categoryFor(article, constraint, policy),
    source_scope_policy: policy,
  };
}
