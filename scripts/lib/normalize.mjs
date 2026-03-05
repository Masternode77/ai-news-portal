import crypto from 'node:crypto';

export function normalizeUrl(url = '') {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    const dropParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid'];
    dropParams.forEach((param) => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function canonicalTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stableArticleId(url, title) {
  const seed = `${normalizeUrl(url)}|${canonicalTitle(title)}`;
  return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

export function stripHtml(text = '') {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text = '', maxLen = 180) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
}
