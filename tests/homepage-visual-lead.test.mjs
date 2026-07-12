import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import {
  hasGeneratedRasterImage,
  selectHomepageVisualLead,
} from '../scripts/lib/homepage-visual-lead.mjs';

test('homepage visual lead prefers real generated raster imagery over placeholder SVG cards', () => {
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });
  const lead = selectHomepageVisualLead(feed);

  assert.ok(lead, 'expected a homepage visual lead');
  assert.equal(hasGeneratedRasterImage(lead), true);
  assert.match(lead.image, /^\/generated\/articles\/.+\.webp$/);
  assert.notEqual(lead.image_status, 'placeholder');
  assert.notEqual(lead.image_status, 'fallback');
  assert.equal(lead.id, feed.featured.publicSignal.id, 'the visual lead should preserve the newest featured story');
});

test('homepage visual lead falls through to the newest real raster when the featured image is a fallback', () => {
  const feed = {
    featured: {
      publicSignal: {
        id: 'featured',
        image: '/generated/fallbacks/ai-infrastructure.svg',
        image_status: 'fallback',
      },
    },
    items: [
      {
        publicSignal: {
          id: 'generated',
          image: '/generated/articles/generated/thumbnail.webp',
          image_status: 'generated',
        },
      },
    ],
  };

  assert.equal(selectHomepageVisualLead(feed)?.id, 'generated');
});

test('homepage imports visual lead selector for the premium desk card', () => {
  const source = fs.readFileSync('src/pages/index.astro', 'utf8');

  assert.match(source, /selectHomepageVisualLead/);
  assert.doesNotMatch(source, /const leadSignal = feed\.featured\?\.publicSignal \|\| feed\.items\[0\]\?\.publicSignal/);
  assert.match(source, /provenanceLabel=\{leadSignal\?\.image_provenance_label \|\| ''\}/);
});
