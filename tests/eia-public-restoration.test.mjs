import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeRegistryFeeds,
  loadSourceRegistrySync,
  sourceUsageDecision,
} from '../scripts/lib/source-registry.mjs';
import {
  HOMEPAGE_MIN_LOCAL_BLOGS,
  homepageBlogSurfaceResult,
} from '../scripts/lib/homepage-blog-surface-policy.mjs';
import {
  buildEiaRestorationInventory,
  eiaRestorationSpecs,
} from '../scripts/lib/eia-restoration-inventory.mjs';
import { articleDetailQualityResult } from '../scripts/lib/article-detail-quality-gate.mjs';
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { buildRssItems } from '../scripts/lib/rss-builder.mjs';
import { buildSitemapEntries } from '../scripts/lib/sitemap-builder.mjs';
import { publicProductFitResult } from '../scripts/lib/public-product-fit.mjs';

test('EIA restoration source authorizes public-domain text but not source images', () => {
  const sources = loadSourceRegistrySync();
  const source = sources.find((candidate) => candidate.id === 'eia-today-in-energy');

  assert.ok(source, 'EIA source must be registered');
  assert.equal(source.feed, 'https://www.eia.gov/rss/todayinenergy.xml');
  assert.equal(source.terms_url, 'https://www.eia.gov/about/copyrights_reuse.php');
  assert.equal(
    sourceUsageDecision({ sourceRegistryId: source.id }, sources, 'text', new Date('2026-08-12T00:00:00Z')).authorized,
    true,
  );
  assert.equal(
    sourceUsageDecision({ sourceRegistryId: source.id }, sources, 'image', new Date('2026-08-12T00:00:00Z')).authorized,
    false,
  );
  assert.equal(
    activeRegistryFeeds(sources, new Date('2026-08-12T00:00:00Z')).some((feed) => feed.sourceRegistryId === source.id),
    true,
  );
});

test('quality-first restoration requires five local analyses before normal mode passes', () => {
  const localBlogs = Array.from({ length: 5 }, (_, index) => ({
    id: `restored-analysis-${index}`,
    blog_route: 'standard_blog',
    homepagePublished: true,
    articlePagePublished: true,
    archiveOnly: false,
    noindex: false,
  }));

  assert.equal(HOMEPAGE_MIN_LOCAL_BLOGS, 5);
  assert.equal(homepageBlogSurfaceResult(localBlogs).ok, true);
  assert.equal(homepageBlogSurfaceResult(localBlogs.slice(0, 4)).ok, false);
});

test('EIA restoration inventory exposes fifteen source-backed cards and five local analyses', () => {
  const evidence = [
    'EIA source evidence documents data centers, electricity demand, grid capacity, utilities, cooling, server load, generation, transmission, interconnection, and regional power planning.',
    'The analysis describes data center operators, capacity planners, investors, and electricity suppliers responding to infrastructure demand and facility schedules.',
  ].join(' ').repeat(12);
  const sourceTexts = Object.fromEntries(eiaRestorationSpecs().map((spec) => [spec.id, evidence]));
  const records = buildEiaRestorationInventory(sourceTexts);
  const sources = loadSourceRegistrySync();
  const options = { sourceRegistry: sources, now: '2026-08-12T03:00:00.000Z' };

  assert.equal(records.length, 15);
  assert.equal(new Set(records.map((record) => record.id)).size, 15);
  assert.equal(new Set(records.map((record) => record.sourceUrl)).size, 15);
  assert.equal(records.some((record) => record.sourceImage || record.image || record.imageUrl), false);
  assert.equal(records.filter((record) => record.articlePagePublished).length, 5);
  assert.equal(records.filter((record) => record.signalCardOnly).length, 10);
  assert.ok(records.filter((record) => record.articlePagePublished)
    .every((record) => articleDetailQualityResult(record).ok));
  const homepage = buildHomepageFeed(records, options);
  assert.equal(homepage.items.length, 15);
  assert.equal(
    homepage.items.every((article) => article.publicSignal.why_it_matters === article.public_presentation.why_it_matters),
    true,
  );
  const rssItems = buildRssItems(records, options);
  assert.equal(rssItems.length, 15);
  const signalSpec = eiaRestorationSpecs().find((spec) => spec.id === 'eia-computing-hub-demand');
  const signalRssItem = rssItems.find((item) => item.title === signalSpec.title);
  assert.equal(signalRssItem.description, signalSpec.deck);
  assert.equal(buildSitemapEntries(records, options)
    .filter((entry) => entry.loc.startsWith('/news/')).length, 5);
});

test('fossil generation is treated as power infrastructure, not paleontology', () => {
  const specs = eiaRestorationSpecs();
  const evidence = 'Fossil generation could rise with faster electricity demand growth from data centers while grid operators compare generating capacity, natural gas, coal, electricity load, transmission, and wholesale power prices. '.repeat(12);
  const sourceTexts = Object.fromEntries(specs.map((spec) => [spec.id, evidence]));
  const [record] = buildEiaRestorationInventory(sourceTexts);

  assert.equal(publicProductFitResult(record).ok, true);
});
