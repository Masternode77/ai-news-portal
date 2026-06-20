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

function axisItem(index, axis, hoursAgo = index) {
  const byAxis = {
    capacity: {
      title: 'Hyperscaler lease turns into live data center capacity',
      primary_category: 'Data Centers',
      infrastructure_layer: 'data center facility',
      deck: 'A named lease changes where AI demand becomes usable data center capacity for buyers.',
    },
    power: {
      title: 'Utility interconnection queue delays AI campus energization',
      primary_category: 'Power & Grid',
      infrastructure_layer: 'power',
      deck: 'A grid queue delay changes energization timing for AI campus operators.',
    },
    capital: {
      title: 'Infrastructure fund prices new data center capital raise',
      primary_category: 'Capital Markets',
      infrastructure_layer: 'capital',
      deck: 'A capital raise shows which AI infrastructure risk investors still underwrite.',
    },
    'supply-chain': {
      title: 'Transformer supplier backlog shifts AI campus delivery dates',
      primary_category: 'Supply Chain',
      infrastructure_layer: 'equipment supply',
      deck: 'A supplier backlog changes delivery timing for substations and AI capacity commitments.',
    },
    risk: {
      title: 'Local permitting challenge raises data center siting risk',
      primary_category: 'Policy & Siting',
      infrastructure_layer: 'risk',
      deck: 'A permitting challenge changes the exposure profile for data center developers.',
    },
  };
  return {
    ...item(index),
    ...byAxis[axis],
    id: `axis-${axis}-${index}`,
    publishedAt: new Date(Date.UTC(2026, 4, 20, 12 - hoursAgo)).toISOString(),
    bottleneck_type: axis,
    generatedImage: `/generated/fallbacks/${axis === 'supply-chain' ? 'supply-chain' : axis === 'capacity' ? 'data-centers' : axis === 'risk' ? 'regulation' : axis}.svg`,
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

test('homepage first viewport cards represent distinct bottleneck axes when eligible signals exist', () => {
  const feed = buildHomepageFeed([
    ...Array.from({ length: 5 }, (_, index) => axisItem(index + 50, 'power', index)),
    axisItem(1, 'capacity', 8),
    axisItem(2, 'capital', 9),
    axisItem(3, 'supply-chain', 10),
    axisItem(4, 'risk', 11),
  ], { limit: 9, minimumVisible: 0 });
  const firstViewportAxes = feed.items.slice(0, 5).map((entry) => entry.publicSignal.bottleneck_axis);

  assert.deepEqual(firstViewportAxes, ['power', 'capacity', 'capital', 'supply-chain', 'risk']);
  assert.equal(new Set(feed.items.slice(0, 5).map((entry) => entry.publicSignal.deck)).size, 5);
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
