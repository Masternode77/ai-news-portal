import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';

function readText(url) {
  return fs.readFileSync(new URL(url, import.meta.url), 'utf8');
}

function getMobileBlock(styles) {
  const start = styles.indexOf('@media (max-width: 720px)');
  return start >= 0 ? styles.slice(start) : '';
}

function readStyles() {
  return [
    readText('../src/styles/global.css'),
    readText('../src/styles/redesign.css'),
    readText('../src/styles/public-intelligence.css'),
  ].join('\n');
}

function getTemplateSource(source) {
  const frontmatterEnd = source.indexOf('---', 3);
  return frontmatterEnd >= 0 ? source.slice(frontmatterEnd + 3) : source;
}

test('homepage premium surface renders a named intelligence desk module before the feed', () => {
  const source = readText('../src/pages/index.astro');
  const templateSource = getTemplateSource(source);
  const feedSource = readText('../src/components/LatestAnalysisFeed.astro');

  assert.match(source, /FeaturedArticle/);
  assert.match(source, /LatestAnalysisFeed/);
  assert.match(source, /data-homepage-premium-surface="intelligence-desk"/);
  assert.match(source, /Infrastructure Intelligence Desk/);
  assert.match(source, /data-premium-hero-headline/);
  assert.match(source, /data-premium-market-context/);
  assert.match(source, /data-premium-lead-card/);
  assert.ok(templateSource.indexOf('data-homepage-premium-surface="intelligence-desk"') < templateSource.indexOf('FeaturedArticle'));
  assert.ok(templateSource.indexOf('data-homepage-premium-surface="intelligence-desk"') < templateSource.indexOf('LatestAnalysisFeed'));
  assert.match(feedSource, /ArticleCard/);
});

test('homepage redesign exposes the public command center before latest signals', () => {
  // Given: the homepage template is the canonical public entry point.
  const source = readText('../src/pages/index.astro');
  const templateSource = getTemplateSource(source);
  const commandCenterIndex = templateSource.indexOf('data-public-command-center');
  const latestSignalsIndex = templateSource.indexOf('Latest Signals');

  // When: the redesigned product surface is inspected.
  assert.notEqual(commandCenterIndex, -1, 'expected stable redesign marker data-public-command-center');
  assert.notEqual(latestSignalsIndex, -1, 'expected Latest Signals feed label');

  // Then: the public command surface leads the news feed rather than trailing it.
  assert.ok(commandCenterIndex < latestSignalsIndex, 'public command center should appear before Latest Signals');
});

test('homepage premium surface is part of the first viewport masthead system', () => {
  const source = readText('../src/pages/index.astro');
  const templateSource = getTemplateSource(source);
  const markerIndex = templateSource.indexOf('data-homepage-premium-surface="intelligence-desk"');
  const deskHeadingIndex = templateSource.indexOf('Infrastructure Intelligence Desk');
  const heroBriefIndex = templateSource.search(/class="[^"]*\bhero-brief\b[^"]*"/);
  const categoryNavIndex = templateSource.indexOf('CategoryNav');
  const headerCloseIndex = templateSource.indexOf('</header>');

  assert.notEqual(markerIndex, -1, 'expected premium surface marker');
  assert.notEqual(deskHeadingIndex, -1, 'expected named intelligence desk heading');
  assert.notEqual(heroBriefIndex, -1, 'expected hero brief in masthead');
  assert.notEqual(categoryNavIndex, -1, 'expected category navigation');
  assert.notEqual(headerCloseIndex, -1, 'expected publication header close');
  assert.ok(markerIndex > heroBriefIndex, 'premium surface should be attached to the hero brief');
  assert.match(
    templateSource,
    /class="[^"]*\bhero-brief\b[^"]*"[\s\S]*data-homepage-premium-surface="intelligence-desk"/,
  );
  assert.ok(markerIndex < categoryNavIndex, 'premium surface should render before CategoryNav');
  assert.ok(deskHeadingIndex < categoryNavIndex, 'desk heading should render before CategoryNav');
  assert.ok(markerIndex < headerCloseIndex, 'premium surface should stay inside the first viewport header');
});

test('homepage premium surface keeps the intelligence deck readable on mobile', () => {
  const styles = readStyles();
  const mobileBlock = getMobileBlock(styles);

  assert.ok(mobileBlock.length > 0, 'expected a mobile media block');
  assert.match(mobileBlock, /data-homepage-premium-surface="intelligence-desk"/);
  assert.match(mobileBlock, /data-premium-hero-headline/);
  assert.match(mobileBlock, /data-premium-market-context/);
  assert.match(mobileBlock, /data-premium-lead-card/);
  assert.match(mobileBlock, /min-width:\s*0/);
  assert.match(mobileBlock, /max-width:\s*100%/);
  assert.match(mobileBlock, /grid-template-columns:\s*1fr/);
  assert.match(mobileBlock, /overflow-wrap:\s*anywhere/);
  assert.match(mobileBlock, /white-space:\s*normal/);
  assert.equal(/data-homepage-premium-surface="intelligence-desk"[\s\S]*font-size:\s*[^;]*vw/s.test(mobileBlock), false);
});

test('homepage mobile masthead stacks hero and intelligence desk without grid overlap', () => {
  const styles = readStyles();
  const mobileBlock = getMobileBlock(styles);

  assert.match(
    mobileBlock,
    /\.publication-home \.masthead-row\s*{[\s\S]*grid-template-columns:\s*1fr/,
  );
  assert.match(
    mobileBlock,
    /\.publication-home \.hero-copy\s*{[\s\S]*width:\s*100%/,
  );
  assert.match(
    mobileBlock,
    /\.publication-home \.hero-brief\[data-homepage-premium-surface="intelligence-desk"\]\s*{[\s\S]*width:\s*100%/,
  );
});

test('homepage premium desk keeps core intelligence visible inside the desktop masthead', () => {
  const styles = readStyles();

  assert.match(
    styles,
    /\.publication-home \.hero-brief\[data-homepage-premium-surface="intelligence-desk"\] \[data-premium-market-context\]\s*{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /\.publication-home \.hero-brief\[data-homepage-premium-surface="intelligence-desk"\] \[data-premium-market-context\] article\s*{[\s\S]*min-height:\s*0/,
  );
  assert.match(
    styles,
    /\.publication-home \.hero-brief\[data-homepage-premium-surface="intelligence-desk"\] \[data-premium-lead-card\] h3\s*{[\s\S]*line-clamp:\s*2/,
  );
});

test('homepage premium surface preserves article feed and avoids generic AI-blog styling', () => {
  const homepageSource = readText('../src/pages/index.astro');
  const feedSource = readText('../src/components/LatestAnalysisFeed.astro');
  const styles = readStyles();
  const combined = [homepageSource, feedSource, styles].join('\n');
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });

  assert.ok(feed.items.length >= 30);
  for (const item of feed.items.slice(0, 6)) {
    assert.ok(item.publicSignal?.title, item.id);
    assert.ok(item.publicSignal?.view_detail || item.publicSignal?.read_source, item.id);
    assert.ok(item.publicSignal?.image, item.id);
    assert.ok(item.publicSignal?.image_alt, item.id);
  }

  assert.match(homepageSource, /LatestAnalysisFeed/);
  assert.match(feedSource, /ArticleCard/);
  assert.equal(/AI revolution|unlock the future|transform your business|cutting-edge AI|game-changing/i.test(combined), false);
  assert.match(combined, /data-homepage-premium-surface="intelligence-desk"/);
  assert.equal(/data-homepage-premium-surface="intelligence-desk"[\s\S]*(purple|violet|indigo|#7c3aed|#6d28d9|#2563eb)/i.test(combined), false);
});
