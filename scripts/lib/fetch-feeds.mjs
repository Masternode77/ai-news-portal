import Parser from 'rss-parser';
import { FEEDS, MAX_ITEMS_FETCHED } from './constants.mjs';
import { guessLanguage, normalizeUrl, stableArticleId, stripHtml, truncate } from './normalize.mjs';

const parser = new Parser({
  timeout: 20000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

function firstImage(item) {
  if (item.enclosure?.url && item.enclosure?.type?.startsWith('image')) return item.enclosure.url;
  const media = item.mediaContent?.[0]?.$?.url;
  if (media) return media;
  const html = item.contentEncoded || item.content || item.summary || '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function parseItem(feed, item) {
  const title = (item.title || '').trim();
  const url = normalizeUrl(item.link || item.guid || '');
  if (!title || !url) return null;

  const rawBody = stripHtml(item.contentEncoded || item.content || item.summary || item.contentSnippet || '');
  const rawSnippet = stripHtml(item.contentSnippet || item.summary || rawBody || '');
  const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();

  return {
    id: stableArticleId(url, title),
    source: feed.source,
    url,
    title,
    snippet: truncate(rawSnippet || rawBody, 220),
    contentText: truncate(rawBody, 800),
    publishedAt: new Date(publishedAt).toISOString(),
    sourceImage: firstImage(item),
    region: feed.region || 'Global',
    language: feed.language || guessLanguage(`${title} ${rawSnippet}`),
    defaultCategory: feed.defaultCategory || null,
  };
}

async function fetchFeedItems(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || [])
      .map((item) => parseItem(feed, item))
      .filter(Boolean);
  } catch (error) {
    console.error(`[pipeline] feed failed: ${feed.source} -> ${error.message}`);
    return [];
  }
}

export async function fetchNewsPool() {
  const fetched = (await Promise.all(FEEDS.map(fetchFeedItems))).flat();

  fetched.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const deduped = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (const item of fetched) {
    if (seenIds.has(item.id)) continue;

    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    if (seenTitles.has(titleKey)) continue;

    seenIds.add(item.id);
    seenTitles.add(titleKey);
    deduped.push(item);

    if (deduped.length >= MAX_ITEMS_FETCHED) break;
  }

  return deduped;
}
