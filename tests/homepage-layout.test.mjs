import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';

function item(index, tier = 'editorial_brief') {
  return {
    id: `item-${index}`,
    title: `AI infrastructure item ${index}`,
    source: index % 2 ? 'Utility Dive' : 'Data Center Dynamics',
    publishedAt: new Date(Date.UTC(2026, 4, 20, index % 24)).toISOString(),
    primary_category: index % 2 ? 'Power & Grid' : 'Data Centers',
    infrastructure_layer: index % 2 ? 'power' : 'data center facility',
    public_content_tier: tier,
    homepagePublished: true,
    archiveOnly: false,
    seo_noindex: false,
    deck: `A concrete ${index % 2 ? 'power' : 'data center'} constraint changes capacity planning for AI infrastructure buyers.`,
  };
}

test('homepage feed exposes 30 to 50 public cards when enough eligible items exist', () => {
  const feed = buildHomepageFeed(Array.from({ length: 36 }, (_, index) => item(index)));

  assert.equal(feed.items.length, 36);
  assert.ok(feed.featured.publicSignal.title);
  assert.equal(feed.featured.publicSignal.title, feed.items[0].publicSignal.title);
  assert.equal(feed.items.every((entry) => entry.publicSignal.title), true);
  assert.equal(feed.sections.length, 1);
  assert.equal(feed.sections[0].title, 'Latest Analysis');
});

test('homepage feed mixes longform and short public items without internal buckets', () => {
  const feed = buildHomepageFeed([
    item(1, 'longform_analysis'),
    item(2, 'editorial_brief'),
    item(3, 'signal_card'),
    { ...item(4, 'hidden'), homepagePublished: false, archiveOnly: true },
  ]);
  const labels = feed.items.map((entry) => entry.publicSignal.signal_label);

  assert.deepEqual(labels.sort(), ['Analysis', 'Brief', 'Signal'].sort());
  assert.equal(feed.items.some((entry) => /Signals being monitored|Published deskwork|Cycle status/i.test(JSON.stringify(entry))), false);
});

test('homepage feed only links to article detail pages that pass public longform eligibility', () => {
  const feed = buildHomepageFeed([
    {
      ...item(7, 'longform_analysis'),
      articlePagePublished: true,
      sourceUrl: 'https://example.com/source-story',
      expertLensFull: { finalArticleBody: 'Too short for a public article page.' },
    },
  ]);

  assert.equal(feed.items[0].publicSignal.view_detail, '');
  assert.equal(feed.items[0].publicSignal.read_source, 'https://example.com/source-story');
});

test('homepage cards use a public board layout', () => {
  const cardSource = fs.readFileSync('src/components/ArticleCard.astro', 'utf8');
  const styles = fs.readFileSync('src/styles/global.css', 'utf8');

  assert.match(styles, /\.article-list\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.article-list-card\s*{[^}]*flex-direction:\s*column/s);
  assert.match(cardSource, /article-impact-pills/);
  assert.equal(/Cycle status|qualifying signal|Published deskwork/i.test(cardSource), false);
});

test('homepage composes dedicated publication components', () => {
  const source = fs.readFileSync('src/pages/index.astro', 'utf8');
  const feedSource = fs.readFileSync('src/components/LatestAnalysisFeed.astro', 'utf8');
  const styles = fs.readFileSync('src/styles/global.css', 'utf8');

  assert.match(source, /FeaturedArticle/);
  assert.match(source, /CategoryNav/);
  assert.match(source, /hero-brief/);
  assert.match(source, /Latest Signals/);
  assert.match(feedSource, /ArticleCard/);
  assert.match(styles, /\.featured-article\s*{/);
  assert.match(styles, /\.category-nav\s*{/);
  assert.match(styles, /\.publication-home\s*{/);
});
