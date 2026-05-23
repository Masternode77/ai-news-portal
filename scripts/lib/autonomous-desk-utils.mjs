import crypto from 'node:crypto';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { stripHtml } from './visible-body-length.mjs';

export const AUTONOMOUS_VERSION = 'autonomous_editorial_desk_v1';

export function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

export function sentence(value = '') {
  const text = compact(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function hash(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

export function dateMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function domainFor(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function publicSourceUrl(item = {}) {
  return item.sourceUrl || item.url || item.expertLensFull?.sourceLink || '';
}

export function evidenceTextFor(item = {}) {
  return compact([
    item.cleaned_source_text,
    item.source_evidence_text,
    item.articleText,
    item.contentText,
    item.fullArticleText,
    item.summary,
    item.snippet,
    item.title,
  ].filter(Boolean).join(' '));
}

export function titleTextFor(item = {}) {
  return compact(item.title || item.expertLensFull?.finalHeadline || 'Untitled signal');
}

export function splitSentences(text = '') {
  return compact(stripHtml(text))
    .split(/(?<=[.!?])\s+/)
    .map((line) => sentence(line))
    .filter((line) => line.length >= 45 && line.length <= 320)
    .filter((line) => !/(copyright|privacy policy|terms of use|newsletter|advertisement|registered office|want more)/i.test(line))
    .filter((line) => !/(fuelin\.|clo\.|Hundreds o\.|\b[a-z]\.|\bU\.S\.|\bU\.K\.)$/i.test(line));
}

export function verifiedFactSentences(item = {}, limit = 8) {
  const source = compact(item.source || 'Source');
  const title = titleTextFor(item);
  const sentences = splitSentences(evidenceTextFor(item));
  const facts = [
    sentence(`The source item centers on ${title}`),
    ...sentences,
  ];
  const seen = new Set();
  return facts.filter((fact) => {
    const key = fact.toLowerCase();
    if (!fact || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

const KNOWN_ENTITIES = [
  'OpenAI', 'AWS', 'Amazon', 'Microsoft', 'Azure', 'Oracle', 'NVIDIA', 'AMD', 'Blackstone',
  'Applied Digital', 'Anthropic', 'CoreWeave', 'Meta', 'Google', 'Tesla', 'xAI', 'Digital Realty',
  'Equinix', 'NetApp', 'Red Hat', 'OpenShift', 'Proxmox', 'KVM', 'Hyper-V', 'Nutanix', 'IREN',
  'Coatue', 'Switch', 'Cerebras', 'Core Scientific', 'ByteDance', 'SpaceX', 'Colossus',
  'Delta Electronics', 'Denmark', 'Texas', 'China', 'KKR', 'Kokusai',
];

export function extractCompanies(text = '') {
  const source = compact(text);
  const found = KNOWN_ENTITIES.filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(source));
  const caps = source.match(/\b(?:[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,3}|NVIDIA|AMD|HBM|GPU|CPU|PPA|REIT)\b/g) || [];
  const out = [];
  for (const value of [...found, ...caps]) {
    const cleaned = compact(value);
    if (!cleaned || /^(The|This|That|A|An|In|For|With|Source|Global|AI|US|EU|APAC)$/.test(cleaned)) continue;
    if (!out.some((item) => item.toLowerCase() === cleaned.toLowerCase())) out.push(cleaned);
  }
  return out.slice(0, 8);
}

export function extractRegions(text = '') {
  const source = compact(text).toLowerCase();
  const regions = [];
  if (/\b(us|u\.s\.|united states|texas|virginia|arizona|oregon|louisiana)\b/i.test(source)) regions.push('US');
  if (/\b(europe|eu|denmark|france|germany|uk|ireland|netherlands|nordic)\b/i.test(source)) regions.push('Europe');
  if (/\b(china|japan|korea|singapore|malaysia|india|taiwan|apac)\b/i.test(source)) regions.push('APAC');
  if (/\b(saudi|uae|qatar|middle east)\b/i.test(source)) regions.push('Middle East');
  return regions.length ? regions : ['Global'];
}

export function inferInfrastructureLayer(text = '') {
  const source = compact(text);
  const checks = [
    ['power', /\b(power|grid|electricity|utility|ppa|substation|transformer|interconnection|energy)\b/i],
    ['data center facility', /\b(data centers?|datacenters?|colocation|campus|facility|site|lease|construction)\b/i],
    ['cooling', /\b(cooling|thermal|liquid cooling|cdu|heat rejection|rack density)\b/i],
    ['semiconductor supply', /\b(semiconductor|chip|wafer|packaging|equipment|foundry)\b/i],
    ['accelerator systems', /\b(gpu|accelerator|nvidia|amd|training cluster|inference cluster)\b/i],
    ['HBM / memory', /\b(hbm|memory|dram|ddr|vram)\b/i],
    ['networking', /\b(network|ethernet|infiniband|fiber|connectivity|optical)\b/i],
    ['storage', /\b(storage|backup|disaster recovery|data management)\b/i],
    ['enterprise platform infrastructure', /\b(openshift|kubernetes|virtualization|hyper-v|kvm|proxmox|nutanix|platform)\b/i],
    ['capital formation for AI infrastructure', /\b(capital|funding|financing|ipo|reit|debt|equity|stake|acquisition|joint venture)\b/i],
    ['permitting / siting / regulation', /\b(permit|permitting|siting|zoning|moratorium|regulation|county|policy)\b/i],
  ];
  return checks.find(([, pattern]) => pattern.test(source))?.[0] || '';
}

export function extractNumericClaims(text = '') {
  const source = compact(text);
  const matches = [...source.matchAll(/\b(\d+(?:\.\d+)?)\s?(GW|MW|kW|billion|million|%|percent|years?|months?|days?|sq\.?\s?ft|megawatts?|gigawatts?)\b/gi)];
  return matches.map((match, index) => ({
    raw: compact(match[0]),
    numeric_value: Number(match[1]),
    unit: match[2],
    index,
  }));
}

export function routeLabelToType(route = '') {
  if (/featured/i.test(route)) return 'Featured Analysis';
  if (/standard/i.test(route)) return 'Standard Analysis';
  if (/watchlist/i.test(route)) return 'Watchlist Signal';
  return 'Internal Archive';
}

export function relativeNewsHref(article = {}) {
  return article.id ? `/news/${article.id}/` : '';
}
