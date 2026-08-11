import assert from 'node:assert/strict';
import test from 'node:test';
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { buildPublicPresentation } from '../scripts/lib/public-presentation.mjs';

function isUnsafeSourceImage(signal = {}) {
  const status = String(signal.image_status || '');
  const provider = String(signal.image_provider || '');
  return provider === 'source-image' || status === 'source-canonical';
}

function unsafeSummary(signals = []) {
  return signals
    .filter(isUnsafeSourceImage)
    .slice(0, 20)
    .map((signal) => ({
      id: signal.id,
      title: signal.title,
      image: signal.image,
      status: signal.image_status,
      provider: signal.image_provider,
    }));
}

test('public article presentations do not expose unapproved source imagery', () => {
  const allArticles = [...latestNews, ...archivedNews];
  const presentations = allArticles.map((article) => buildPublicPresentation(article));
  const unsafe = presentations.filter(isUnsafeSourceImage);

  assert.equal(unsafe.length, 0, JSON.stringify(unsafeSummary(unsafe), null, 2));
});

test('homepage feed does not expose unapproved source imagery', () => {
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });
  const signals = [feed.featured, ...feed.items].map((entry) => entry?.publicSignal).filter(Boolean);
  const unsafe = signals.filter(isUnsafeSourceImage);

  assert.equal(unsafe.length, 0, JSON.stringify(unsafeSummary(unsafe), null, 2));
});
