import crypto from 'node:crypto';
import { CATEGORIES, CATEGORY_KEYWORDS, REGION_HINTS } from './constants.mjs';

export function normalizeUrl(url = '') {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    const dropParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'ref',
      'fbclid',
      'gclid',
      'mc_cid',
      'mc_eid',
    ];
    dropParams.forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function canonicalTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stableArticleId(url, title) {
  const seed = `${normalizeUrl(url)}|${canonicalTitle(title)}`;
  return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

export function stripHtml(text = '') {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeGeneratedText(text = '') {
  if (!text) return '';

  return String(text)
    .replace(/\b(?:bye\s+end|end\s+bye)(?:\s+(?:bye\s+end|end\s+bye))*\b/gi, ' ')
    .replace(/(?:\s*\n\s*){3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function truncate(text = '', maxLen = 180) {
  const cleaned = sanitizeGeneratedText(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxLen) return cleaned.trim();
  return `${cleaned.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

export function slugify(text = '') {
  const slug = text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9가-힣\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug || 'article';
}

export function shiftedToKst(date = new Date()) {
  return new Date(date.getTime() + (9 * 60 * 60 * 1000));
}

export function kstDayKey(date = new Date()) {
  const shifted = shiftedToKst(date);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function kstSlot(date = new Date()) {
  const hour = shiftedToKst(date).getUTCHours();
  if (hour < 8) return 0;
  if (hour < 16) return 1;
  return 2;
}

export function guessLanguage(text = '') {
  if (/[가-힣]/.test(text)) return 'ko';
  return 'en';
}

export function inferCategory(text = '', fallback = '') {
  const haystack = `${text} ${fallback}`.toLowerCase();
  for (const category of CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category] || [];
    if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return category;
    }
  }
  return fallback || 'AI Infrastructure (GPU/Neocloud)';
}

export function inferRegion(text = '', fallback = 'Global') {
  const haystack = text.toLowerCase();
  for (const [region, keywords] of Object.entries(REGION_HINTS)) {
    if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return region;
    }
  }
  return fallback;
}

export function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function buildFallbackTags(text = '', category = '') {
  const haystack = text.toLowerCase();
  const tagMap = [
    ['gpu', ['gpu', 'nvidia', 'amd', 'accelerator']],
    ['cloud', ['cloud', 'hyperscale', 'region']],
    ['power', ['power', 'utility', 'grid', 'energy']],
    ['cooling', ['cooling', 'liquid', 'thermal', 'mep']],
    ['semiconductor', ['semiconductor', 'chip', 'wafer', 'fab']],
    ['policy', ['policy', 'regulation', 'permit', 'compliance']],
    ['colocation', ['colocation', 'colo', 'wholesale']],
    ['financing', ['funding', 'merger', 'acquisition', 'investment', 'financing']],
  ];
  const tags = tagMap
    .filter(([, keywords]) => keywords.some((keyword) => haystack.includes(keyword)))
    .map(([tag]) => tag);

  if (category.includes('Power')) tags.push('energy');
  if (category.includes('Cooling')) tags.push('rack-density');
  if (category.includes('AI Infrastructure')) tags.push('inference');
  return unique(tags).slice(0, 6);
}

export function safeJsonParse(maybeJson, fallback = null) {
  if (!maybeJson || typeof maybeJson !== 'string') return fallback;
  try {
    return JSON.parse(maybeJson);
  } catch {
    const match = maybeJson.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]);
    } catch {
      return fallback;
    }
  }
}
