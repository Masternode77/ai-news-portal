import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';

test('public feed cards carry displayable editorial images', () => {
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });
  assert.ok(feed.items.length >= 30);
  assert.equal(feed.items.filter((item) => !item.publicSignal?.image).length, 0);
  assert.equal(feed.items.filter((item) => !item.publicSignal?.image_alt).length, 0);
});

test('article card and header templates render images', () => {
  const cardSource = fs.readFileSync(new URL('../src/components/ArticleListCard.astro', import.meta.url), 'utf8');
  const headerSource = fs.readFileSync(new URL('../src/components/ArticleHeader.astro', import.meta.url), 'utf8');
  const articlePageSource = fs.readFileSync(new URL('../src/pages/news/[id].astro', import.meta.url), 'utf8');

  assert.match(cardSource, /class="article-card-image"/);
  assert.match(headerSource, /class="article-hero-image"/);
  assert.match(articlePageSource, /image=\{detailImage\}/);
});
