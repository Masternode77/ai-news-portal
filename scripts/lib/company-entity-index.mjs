import { publicTaxonomyItems, taxonomySlugify } from './taxonomy-page-builder.mjs';
import { compact } from './autonomous-desk-utils.mjs';

export const DEFAULT_COMPANIES = ['OpenAI', 'AWS', 'Microsoft', 'Oracle', 'NVIDIA', 'AMD', 'Blackstone', 'Applied Digital', 'Anthropic', 'CoreWeave', 'Meta', 'Google', 'Tesla', 'xAI', 'Digital Realty', 'Equinix'];

const COMPANY_HINTS = [
  ...DEFAULT_COMPANIES,
  'Dell',
  'NetApp',
  'Red Hat',
  'Kyndryl',
  'KKR',
  'Kokusai',
  'IREN',
  'Switch',
  'Cerebras',
  'Core Scientific',
  'Green Capital',
  'Prime Capital',
];

const ENTITY_STOPWORDS = new Set([
  'and',
  'at',
  'bess',
  'cloud platform',
  'compute',
  'cpu',
  'ec2 m3 ultra mac',
  'eu',
  'every',
  'for ai',
  'inside',
  'just',
  'mainframe',
  'may',
  'most aggressive enterprise storage',
  'mw',
  'net',
  'our',
  'poland',
  'power',
  'powerstore',
  'research bits',
  'reset',
  'storage',
  'there',
  'uv',
  'vmware',
  'we',
  'windows',
  'years',
]);

function sourceText(article = {}) {
  return compact([
    article.title,
    article.summary,
    article.deck,
    article.expertLensFull?.finalArticleBody,
    article.articleText,
  ].filter(Boolean).join(' '));
}

function isDefaultCompany(name = '') {
  return DEFAULT_COMPANIES.some((company) => company.toLowerCase() === name.toLowerCase());
}

function isPlausibleCompanyEntity(value = '') {
  const name = compact(value);
  const lower = name.toLowerCase();
  if (!name || ENTITY_STOPWORDS.has(lower)) return false;
  if (isDefaultCompany(name)) return true;
  if (/^\d/.test(name) || /\b(?:mw|gw|gb|tb|cpu|gpu|hbm|bess|ppa|reit)\b/i.test(name)) return false;
  if (name.split(/\s+/).length > 4) return false;
  if (/\b(?:roundup|review|inside|reset|years|may|weekly|platform|powerstore|transform|managed|tran|research bits|storage portfolio|battery storage portfolio)\b/i.test(name)) return false;
  if (/^aws\b/i.test(name) && name !== 'AWS') return false;
  if (/^dell\b/i.test(name) && name !== 'Dell') return false;
  return COMPANY_HINTS.some((hint) => lower.includes(hint.toLowerCase()));
}

export function companyEntitiesForArticle(article = {}) {
  const text = sourceText(article);
  const defaultsMentioned = DEFAULT_COMPANIES.filter((company) => new RegExp(`\\b${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  const candidates = [
    ...(article.companies || []),
    ...(article.evidence_pack?.named_entities || []),
    ...(article.claim_ledger || []).flatMap((claim) => claim.entities || []),
    ...defaultsMentioned,
  ];
  return [...new Set(candidates.map(compact).filter(isPlausibleCompanyEntity))];
}

export function buildCompanyIndex(items = []) {
  const publicItems = publicTaxonomyItems(items);
  const names = [...new Set([...DEFAULT_COMPANIES, ...publicItems.flatMap(companyEntitiesForArticle)])];
  return names.map((name) => ({
    slug: taxonomySlugify(name),
    name,
    items: publicItems.filter((article) => companyEntitiesForArticle(article).some((entity) => entity.toLowerCase() === name.toLowerCase())),
  }));
}
