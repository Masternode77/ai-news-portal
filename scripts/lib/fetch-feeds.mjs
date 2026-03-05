import Parser from 'rss-parser';
import { FEEDS, MAX_ITEMS_FETCHED } from './constants.mjs';
import { normalizeUrl, stableArticleId, stripHtml, truncate } from './normalize.mjs';

const parser = new Parser({ timeout: 20000, customFields: { item: [['media:content', 'mediaContent', { keepArray: true }]] } });

function firstImage(item) {
  if (item.enclosure?.url && item.enclosure?.type?.startsWith('image')) return item.enclosure.url;

  const media = item.mediaContent?.[0]?.$?.url;
  if (media) return media;

  const html = item['content:encoded'] || item.content || '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function parseItem(source, item) {
  const title = (item.title || '').trim();
  const url = normalizeUrl(item.link || item.guid || '');
  if (!title || !url) return null;

  const rawSnippet = stripHtml(item.contentSnippet || item.summary || item.content || '');
  const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();

  return {
    id: stableArticleId(url, title),
    source,
    title,
    url,
    snippet: truncate(rawSnippet, 220),
    publishedAt: new Date(publishedAt).toISOString(),
    sourceImage: firstImage(item),
  };
}

export async function fetchNewsPool() {
  const fetched = [];

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items || [])
        .map((item) => parseItem(feed.source, item))
        .filter(Boolean);
      fetched.push(...items);
    } catch (error) {
      console.error(`[pipeline] feed failed: ${feed.source} -> ${error.message}`);
    }
  }

  fetched.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const deduped = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (const item of fetched) {
    if (seenIds.has(item.id)) continue;
    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenTitles.has(titleKey)) continue;

    seenIds.add(item.id);
    seenTitles.add(titleKey);
    deduped.push(item);

    if (deduped.length >= MAX_ITEMS_FETCHED) break;
  }

  return deduped;
}
