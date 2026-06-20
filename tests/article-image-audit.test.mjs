import assert from 'node:assert/strict';
import test from 'node:test';
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { buildPublicPresentation } from '../scripts/lib/public-presentation.mjs';

function isDefaultImage(signal = {}) {
  const image = String(signal.image || '');
  const status = String(signal.image_status || '');
  const provider = String(signal.image_provider || '');
  return !image
    || image.startsWith('/generated/fallbacks/')
    || status === 'fallback'
    || status === 'placeholder'
    || provider === 'category-fallback'
    || provider === 'local-placeholder';
}

function defaultSummary(signals = []) {
  return signals
    .filter(isDefaultImage)
    .slice(0, 20)
    .map((signal) => ({
      id: signal.id,
      title: signal.title,
      image: signal.image,
      status: signal.image_status,
      provider: signal.image_provider,
    }));
}

test('public article presentations do not expose default placeholder imagery', () => {
  const allArticles = [...latestNews, ...archivedNews];
  const presentations = allArticles.map((article) => buildPublicPresentation(article));
  const defaults = presentations.filter(isDefaultImage);

  assert.equal(defaults.length, 0, JSON.stringify(defaultSummary(defaults), null, 2));
});

test('homepage feed does not expose default placeholder imagery', () => {
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });
  const signals = [feed.featured, ...feed.items].map((entry) => entry?.publicSignal).filter(Boolean);
  const defaults = signals.filter(isDefaultImage);

  assert.equal(defaults.length, 0, JSON.stringify(defaultSummary(defaults), null, 2));
});
