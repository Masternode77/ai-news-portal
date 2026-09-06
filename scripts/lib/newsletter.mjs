import { buildHomepageFeed } from './homepage-feed-builder.mjs';

const DAY_MS = 86_400_000;

function publishedMs(article = {}) {
  const value = article.analysisPublishedAt || article.publishedAt || article.updatedAt;
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function plainText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function validNewsletterSubscribeUrl(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function escapeNewsletterHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeDigestHref(value = '') {
  const href = String(value || '').trim();
  return /^\/news\/[a-zA-Z0-9][a-zA-Z0-9._~/-]*\/?$/.test(href) ? `https://www.computecurrent.com${href}` : 'https://www.computecurrent.com/newsletter/';
}

export function buildWeeklyDigest(records = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const nowMs = now.getTime();
  const days = Number.isFinite(Number(options.days)) && Number(options.days) > 0 ? Number(options.days) : 7;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 6) : 6;
  if (!Number.isFinite(nowMs)) throw new TypeError('A valid digest date is required');
  const cutoffMs = nowMs - days * DAY_MS;
  const feed = buildHomepageFeed(records, {
    ...options,
    limit: Math.max(records.length, 1),
    minimumVisible: 0,
  });

  const articles = feed.items
    .filter((article) => Boolean(article.publicSignal?.view_detail))
    .map((article) => ({ article, timestamp: publishedMs(article) }))
    .filter(({ timestamp }) => timestamp !== null && timestamp <= nowMs && timestamp >= cutoffMs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .map(({ article, timestamp }) => ({
      id: article.id,
      title: plainText(article.publicSignal?.title || article.expertLensFull?.finalHeadline || article.title),
      deck: plainText(article.publicSignal?.deck || article.deck || article.summary),
      whyItMatters: plainText(article.publicSignal?.why_it_matters || article.why_it_matters),
      category: plainText(article.publicSignal?.editorial_lens || article.primary_category || article.category || 'AI Infrastructure'),
      source: plainText(article.publicSignal?.source || article.source || 'Source'),
      publishedAt: new Date(timestamp).toISOString(),
      href: article.publicSignal.view_detail,
    }));

  return {
    generatedAt: now.toISOString(),
    windowStart: new Date(cutoffMs).toISOString(),
    windowEnd: now.toISOString(),
    articles,
    count: articles.length,
  };
}

export function renderWeeklyDigestHtml(digest = {}) {
  const articles = Array.isArray(digest.articles) ? digest.articles : [];
  const entries = articles.map((article) => [
    '<article>',
    `<p>${escapeNewsletterHtml(article.category)} · ${escapeNewsletterHtml(article.publishedAt)}</p>`,
    `<h2><a href="${escapeNewsletterHtml(safeDigestHref(article.href))}">${escapeNewsletterHtml(article.title)}</a></h2>`,
    `<p>${escapeNewsletterHtml(article.deck)}</p>`,
    article.whyItMatters ? `<p><strong>Why it matters:</strong> ${escapeNewsletterHtml(article.whyItMatters)}</p>` : '',
    '</article>',
  ].filter(Boolean).join('\n')).join('\n');
  return [
    '<section>',
    '<h1>Compute Current weekly digest</h1>',
    entries || '<p>No qualifying analysis was published in this seven-day window.</p>',
    '<p><a href="https://www.computecurrent.com/rss.xml">Follow the RSS feed</a></p>',
    '</section>',
  ].join('\n');
}
