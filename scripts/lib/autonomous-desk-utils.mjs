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

const BOILERPLATE_SENTENCE = /(copyright|privacy policy|terms of use|newsletter|advertisement|registered office|want more)/i;

// Shared with the claim extractor's standalone headlines so both reject the
// same page furniture.
export function boilerplateSentence(line = '') {
  return BOILERPLATE_SENTENCE.test(String(line || ''));
}

export function splitSentences(text = '') {
  return compact(stripHtml(text))
    .split(/(?<=[.!?])\s+/)
    .map((line) => sentence(line))
    // A long source sentence can still be the primary evidence for several
    // related figures. Dropping it here made those figures impossible to
    // prove later, so length remains only a lower-bound quality filter.
    .filter((line) => line.length >= 45)
    .filter((line) => !boilerplateSentence(line))
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
  const candidates = [];
  const wordComparator = '(?:less\\s+than\\s+or\\s+equal(?:\\s+to)?|more\\s+than\\s+or\\s+equal(?:\\s+to)?|at\\s+least|at\\s+most|more\\s+than|less\\s+than|up\\s+to|under|over|around|roughly|approximately|about|nearly|almost|exactly)';
  // Capture negative prefixes together with the modifier. Supported inversions
  // are canonicalized by numeric-claim-policy; unsupported combinations then
  // have no key and fail closed instead of matching an inner positive phrase.
  const comparator = `(?:(?:(?:no|not)\\s+)?${wordComparator}\\s+|(?:(?:no|not)\\s+)?(?:<=|>=|<|>|~|≤|≥)\\s*)`;
  const number = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
  const addMatches = (pattern, toClaim) => {
    for (const match of source.matchAll(pattern)) {
      const claim = toClaim(match);
      candidates.push({
        ...claim,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  };
  const numericValue = (value) => Number(String(value || '').replaceAll(',', ''));
  const qualifier = (value) => compact(value).toLowerCase();

  addMatches(
    new RegExp(`(?<comparator>${comparator})?\\$(?<value>${number})\\s*(?<scale>trillion|billion|million|thousand|[TBMK])?\\b`, 'gi'),
    (match) => {
      const scale = String(match.groups.scale || '').toLowerCase();
      const scaleName = ({ t: 'trillion', b: 'billion', m: 'million', k: 'thousand' })[scale] || scale;
      return {
        raw: compact(match[0]),
        numeric_value: numericValue(match.groups.value),
        unit: scaleName ? `USD ${scaleName}` : 'USD',
        comparator: qualifier(match.groups.comparator),
      };
    },
  );
  addMatches(
    new RegExp(`(?<comparator>${comparator})?(?<value>${number})\\s*(?<unit>GW|MW|kW|billion|million|%|percent|years?|months?|days?|sq\\.?\\s?ft|megawatts?|gigawatts?)\\b`, 'gi'),
    (match) => ({
      raw: compact(match[0]),
      numeric_value: numericValue(match.groups.value),
      unit: match.groups.unit,
      comparator: qualifier(match.groups.comparator),
    }),
  );
  addMatches(
    new RegExp(`(?<comparator>${comparator})?(?<value>${number})\\s*(?:×|x\\b|times?\\b)`, 'gi'),
    (match) => ({
      raw: compact(match[0]),
      numeric_value: numericValue(match.groups.value),
      unit: 'times',
      comparator: qualifier(match.groups.comparator),
    }),
  );
  addMatches(
    /\b(?<value>\d[\d,]*)(?:st|nd|rd|th)\b/gi,
    (match) => ({ raw: compact(match[0]), numeric_value: numericValue(match.groups.value), unit: 'ordinal', comparator: '' }),
  );
  addMatches(
    /\b(?<value>(?:19|20)\d{2})\b/g,
    (match) => ({ raw: compact(match[0]), numeric_value: numericValue(match.groups.value), unit: 'year', comparator: '' }),
  );

  // In constructions such as "34 and 27 days", grammar supplies the unit
  // only once. Record the first value with that same explicit source unit;
  // the ordinary unit pattern above records the second value.
  addMatches(
    new RegExp(`\\b(?<first>${number})(?=\\s*(?:,|and|to|[-–—])\\s*${number}\\s*(?<unit>years?|months?|days?|GW|MW|kW|megawatts?|gigawatts?)\\b)`, 'gi'),
    (match) => ({
      raw: compact(match.groups.first),
      numeric_value: numericValue(match.groups.first),
      unit: match.groups.unit,
      comparator: '',
    }),
  );

  const selected = [];
  for (const candidate of candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))) {
    const overlaps = selected.some((item) => candidate.start < item.end && candidate.end > item.start);
    if (!overlaps) selected.push(candidate);
  }
  return selected
    .sort((a, b) => a.start - b.start)
    .map(({ start, end, ...claim }, index) => ({ ...claim, index, source_index: start }));
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
