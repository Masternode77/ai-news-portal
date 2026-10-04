// Epoch AI (epoch.ai) publishes its research under CC BY 4.0 ("Epoch AI's
// work is free to use, distribute, and reproduce provided the source and
// authors are credited under the Creative Commons Attribution license", About
// page) but ships no RSS or Atom feed. Its section index pages are
// server-rendered, so discovery reads an index page and each listed article's
// own metadata. Every article page must carry the CC BY 4.0 licence link
// before it is listed or extracted.

export const EPOCH_HOST = 'epoch.ai';
export const EPOCH_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const EPOCH_SECTIONS = {
  '/gradient-updates/': 'Gradient Updates',
  '/data-insights/': 'Data Insights',
};
export const EPOCH_INDEX_ARTICLE_LIMIT = 5;

const ARTICLE_PATH = /^\/(gradient-updates|data-insights)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const DATE_PATTERN = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/;
const BODY_START = /<div[^>]+class=["'][^"']*\bformatted-text content-body article-content\b[^"']*["'][^>]*>/i;
const BODY_END = /<div[^>]+class=["'][^"']*\bcontent-sidebar-right\b/i;

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#8217;|&rsquo;/gi, '’')
    .replace(/&#8216;|&lsquo;/gi, '‘')
    .replace(/&#8220;|&ldquo;/gi, '“')
    .replace(/&#8221;|&rdquo;/gi, '”')
    .replace(/&#8212;|&mdash;/gi, '—')
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function cleanText(value = '') {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function metaContent(html = '', property = '') {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i');
  const tag = String(html || '').match(pattern)?.[0] || '';
  return cleanText(tag.match(/content=["']([^"']*)["']/i)?.[1] || '');
}

// Canonical article target: https://epoch.ai/<section>/<slug>, no port,
// credentials, query or fragment. Anything else is not an Epoch article.
export function epochArticleTarget(value = '') {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== EPOCH_HOST) return null;
  if (url.port || url.username || url.password || url.search || url.hash) return null;
  const match = url.pathname.match(ARTICLE_PATH);
  if (!match) return null;
  const prefix = `/${match[1]}/`;
  return { url: `https://${EPOCH_HOST}${prefix}${match[2]}`, prefix, section: EPOCH_SECTIONS[prefix], slug: match[2] };
}

export function epochIndexLinks(html = '', prefix = '', limit = EPOCH_INDEX_ARTICLE_LIMIT) {
  if (!EPOCH_SECTIONS[prefix]) return [];
  const links = [];
  for (const match of String(html || '').matchAll(/href=["']([^"'#?]+)["']/gi)) {
    const raw = match[1].startsWith('/') ? `https://${EPOCH_HOST}${match[1]}` : match[1];
    const target = epochArticleTarget(raw);
    if (!target || target.prefix !== prefix || links.includes(target.url)) continue;
    links.push(target.url);
    if (links.length >= limit) break;
  }
  return links;
}

export function epochLicensed(html = '') {
  return String(html || '').includes(`href="${EPOCH_LICENSE_URL}"`)
    || String(html || '').includes(`href='${EPOCH_LICENSE_URL}'`);
}

export function epochPublishedAt(html = '') {
  const source = String(html || '');
  const headerIndex = source.search(/class=["'][^"']*\bcontent-header\b/i);
  const region = headerIndex >= 0 ? source.slice(headerIndex, headerIndex + 6000) : source;
  const match = cleanText(region).match(DATE_PATTERN) || cleanText(source).match(DATE_PATTERN);
  if (!match) return '';
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month === undefined || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month, day, 12));
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

export function epochArticleMetadata(html = '', url = '') {
  const target = epochArticleTarget(url);
  if (!target || !epochLicensed(html)) return null;
  const title = metaContent(html, 'og:title')
    || cleanText(String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '')
    || cleanText(String(html).match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s*\|\s*Epoch AI\s*$/i, '');
  const publishedAt = epochPublishedAt(html);
  if (!title || !publishedAt) return null;
  return {
    title,
    description: metaContent(html, 'og:description') || metaContent(html, 'description'),
    publishedAt,
    url: target.url,
    section: target.section,
  };
}

// The article body only, and only from a page that carries the licence link.
export function epochArticleSection(html = '', url = '') {
  if (!epochArticleTarget(url) || !epochLicensed(html)) return '';
  const source = String(html || '');
  const start = source.search(BODY_START);
  if (start < 0) return '';
  const rest = source.slice(start);
  const end = rest.search(BODY_END);
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 60_000);
}

// Builds rss-parser-shaped items for one Epoch section index. `fetchHtml`
// returns the page text for a URL on epoch.ai; a failed article is skipped.
export async function fetchEpochIndexItems(feed = {}, { fetchHtml, limit = EPOCH_INDEX_ARTICLE_LIMIT } = {}) {
  const prefix = feed.articlePathPrefix || '';
  if (!EPOCH_SECTIONS[prefix] || typeof fetchHtml !== 'function') return [];
  const index = await fetchHtml(feed.url);
  const items = [];
  for (const link of epochIndexLinks(index, prefix, limit)) {
    try {
      const metadata = epochArticleMetadata(await fetchHtml(link), link);
      if (!metadata) continue;
      items.push({
        title: metadata.title,
        link: metadata.url,
        isoDate: metadata.publishedAt,
        contentSnippet: metadata.description,
      });
    } catch (error) {
      console.warn(`[epoch] article metadata skipped for ${link}: ${error.message}`);
    }
  }
  return items;
}
