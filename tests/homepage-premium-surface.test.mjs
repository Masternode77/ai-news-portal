import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('homepage renders a data-driven publication lead before the live feed', () => {
  const source = read('src/pages/index.astro');
  const leadIndex = source.indexOf('class="public-lead"');
  const feedIndex = source.indexOf('<LatestAnalysisFeed');

  assert.match(source, /selectHomepageVisualLead\(feed\)/);
  assert.match(source, /PublicSiteHeader/);
  assert.match(source, /PublicSiteFooter/);
  assert.match(source, /ArticleCardImage/);
  assert.match(source, /leadSignal\?\.homepage_headline \|\| leadSignal\?\.title/);
  assert.match(source, /leadSignal\?\.deck/);
  assert.ok(leadIndex >= 0 && feedIndex > leadIndex);
  assert.doesNotMatch(source, /Infrastructure Intelligence Desk|data-homepage-premium-surface|command-center/i);
});

test('selected visual system keeps a publication list instead of a dashboard grid', () => {
  const styles = read('src/styles/public-intelligence.css');

  assert.match(styles, /\.public-site \.article-list\s*{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.public-site \.article-list-card\s*{[\s\S]*grid-template-columns:\s*240px minmax\(0, 1fr\)/);
  assert.match(styles, /\.public-decision-index/);
  assert.match(styles, /\.public-discovery/);
  assert.doesNotMatch(styles, /linear-gradient|radial-gradient/);
});

test('mobile lead shows the visual early without viewport-scaled type', () => {
  const styles = read('src/styles/public-intelligence.css');
  const mobile = styles.slice(styles.indexOf('@media (max-width: 560px)'));

  assert.match(mobile, /\.public-lead-visual\s*{[\s\S]*order:\s*-1/);
  assert.match(mobile, /aspect-ratio:\s*16 \/ 9/);
  assert.match(mobile, /\.public-site \.article-list-card\s*{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(mobile, /\.public-site \.article-card-image-link\s*{[\s\S]*width:\s*100%[\s\S]*aspect-ratio:\s*16 \/ 9/);
  assert.doesNotMatch(mobile, /font-size:\s*[^;]*vw/);
});

test('homepage keeps a substantial eligible feed with an image and destination for every first-view item', () => {
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });

  assert.ok(feed.items.length >= 30);
  assert.equal(feed.featured?.publicSignal?.homepage_headline, "Rapidus puts Japan's 2nm return on one Hokkaido fab");
  for (const item of feed.items.slice(0, 6)) {
    assert.ok(item.publicSignal?.title, item.id);
    assert.ok(item.publicSignal?.view_detail || item.publicSignal?.read_source, item.id);
    assert.ok(item.publicSignal?.image, item.id);
    assert.ok(item.publicSignal?.image_alt, item.id);
    assert.match(item.publicSignal?.format_label || '', /Deep Dive|Analyst Note|Editorial Brief|Source Brief/);
  }
});

test('homepage avoids internal workflow and generic promotional vocabulary', () => {
  const combined = [
    read('src/pages/index.astro'),
    read('src/components/LatestAnalysisFeed.astro'),
    read('src/styles/public-intelligence.css'),
  ].join('\n');

  assert.doesNotMatch(combined, /operating board|qualifying signal|cycle status|generation version|deskwork|intelligence desk/i);
  assert.doesNotMatch(combined, /AI revolution|unlock the future|transform your business|cutting-edge AI|game-changing/i);
});
