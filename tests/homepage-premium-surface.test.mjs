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

test('homepage hero desk module renders before the feed', () => {
  const source = readText('../src/pages/index.astro');
  const templateSource = getTemplateSource(source);
  const feedSource = readText('../src/components/LatestAnalysisFeed.astro');

  assert.match(source, /FeaturedArticle/);
  assert.match(source, /LatestAnalysisFeed/);
  assert.match(source, /ArticleCardImage/);
  assert.match(source, /class="hero-panel"/);
  assert.match(source, /hero-lead-heading/);
  assert.match(source, /aria-label="Current market context"/);
  assert.match(source, /leadImage/);
  assert.match(source, /provenanceLabel=""/);
  assert.doesNotMatch(source, /leadImageProvenanceLabel/);
  assert.ok(templateSource.indexOf('class="hero-panel"') < templateSource.indexOf('FeaturedArticle'));
  assert.ok(templateSource.indexOf('class="hero-panel"') < templateSource.indexOf('LatestAnalysisFeed'));
  assert.match(feedSource, /ArticleCard/);
});

test('homepage redesign exposes publication masthead before latest analysis', () => {
  // Given: the homepage template is the canonical public entry point.
  const source = readText('../src/pages/index.astro');
  const templateSource = getTemplateSource(source);
  const publicationMastheadIndex = templateSource.indexOf('AI Infrastructure Intelligence');
  const latestAnalysisIndex = templateSource.indexOf('Latest Analysis');

  // When: the redesigned product surface is inspected.
  assert.notEqual(publicationMastheadIndex, -1, 'expected publication masthead vocabulary');
  assert.notEqual(latestAnalysisIndex, -1, 'expected Latest Analysis feed label');
  assert.doesNotMatch(templateSource, /data-public-command-center|Infrastructure command center|Latest Signals/i);

  // Then: the publication masthead leads the news feed rather than trailing it.
  assert.ok(publicationMastheadIndex < latestAnalysisIndex, 'publication masthead should appear before Latest Analysis');
});

test('homepage hero desk is part of the first viewport system', () => {
  const source = readText('../src/pages/index.astro');
  const templateSource = getTemplateSource(source);
  const mastheadIndex = templateSource.indexOf('terminal-masthead');
  const tapeIndex = templateSource.indexOf('TickerTape');
  const heroIndex = templateSource.indexOf('terminal-hero');
  const panelIndex = templateSource.indexOf('class="hero-panel"');
  const featuredIndex = templateSource.indexOf('FeaturedArticle');

  assert.notEqual(mastheadIndex, -1, 'expected sticky publication masthead');
  assert.notEqual(tapeIndex, -1, 'expected headline tape');
  assert.notEqual(heroIndex, -1, 'expected hero section');
  assert.notEqual(panelIndex, -1, 'expected hero desk panel');
  assert.notEqual(featuredIndex, -1, 'expected featured story');
  assert.ok(mastheadIndex < tapeIndex, 'masthead should render before the headline tape');
  assert.ok(tapeIndex < heroIndex, 'headline tape should render before the hero');
  assert.ok(heroIndex < panelIndex, 'hero desk panel should live inside the hero section');
  assert.ok(panelIndex < featuredIndex, 'hero desk should render before the featured story');
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
