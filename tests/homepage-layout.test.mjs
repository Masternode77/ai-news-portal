import assert from 'node:assert/strict';
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
