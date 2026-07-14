import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import {
  hasGeneratedRasterImage,
  hasImage2RasterImage,
  selectHomepageVisualLead,
} from '../scripts/lib/homepage-visual-lead.mjs';

test('homepage visual lead prefers Image2 raster imagery over source-canonical cards', () => {
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });
  const lead = selectHomepageVisualLead(feed);

  assert.ok(lead, 'expected a homepage visual lead');
  assert.equal(hasGeneratedRasterImage(lead), true);
  assert.equal(hasImage2RasterImage(lead), true);
  assert.match(lead.image, /^\/generated\/articles\/.+\.webp$/);
  assert.notEqual(lead.image_status, 'placeholder');
  assert.notEqual(lead.image_status, 'fallback');
  assert.equal(lead.image_provenance_kind, 'image2');
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

test('homepage visual lead does not accept Image2 provenance from a non-Image2 provider', () => {
  const feed = {
    featured: {
      publicSignal: {
        id: 'local-provenance-only',
        image: '/generated/articles/local/thumbnail.webp',
        image_status: 'generated',
        image_provider: 'local',
        image_provenance_kind: 'image2',
      },
    },
    items: [
      {
        publicSignal: {
          id: 'actual-image2',
          image: '/generated/articles/image2/thumbnail.webp',
          image_status: 'generated',
          image_provider: 'image2',
          image_provenance_kind: 'image2',
        },
      },
    ],
  };

  assert.equal(hasImage2RasterImage(feed.featured.publicSignal), false);
  assert.equal(selectHomepageVisualLead(feed)?.id, 'actual-image2');
});

test('homepage visual lead does not replace a current lead with stale Image2 artwork', () => {
  const feed = {
    featured: {
      publicSignal: {
        id: 'current',
        date: '2026-07-14T00:00:00.000Z',
        image: '/generated/articles/current/thumbnail.webp',
        image_status: 'generated',
        image_provider: 'source',
      },
    },
    items: [{
      publicSignal: {
        id: 'stale-image2',
        date: '2025-01-01T00:00:00.000Z',
        image: '/generated/articles/stale/thumbnail.webp',
        image_status: 'generated',
        image_provider: 'image2',
      },
    }],
  };

  assert.equal(selectHomepageVisualLead(feed)?.id, 'current');
});

test('homepage visual lead rejects undated Image2 artwork when the feed has a current date', () => {
  const feed = {
    featured: {
      publicSignal: {
        id: 'current',
        date: '2026-07-14T00:00:00.000Z',
        image: '/generated/articles/current/thumbnail.webp',
        image_status: 'generated',
        image_provider: 'source',
      },
    },
    items: [{
      publicSignal: {
        id: 'undated-image2',
        image: '/generated/articles/undated/thumbnail.webp',
        image_status: 'generated',
        image_provider: 'image2',
      },
    }],
  };

  assert.equal(selectHomepageVisualLead(feed)?.id, 'current');
});

test('homepage imports visual lead selector for the premium desk card', () => {
  const source = fs.readFileSync('src/pages/index.astro', 'utf8');

  assert.match(source, /selectHomepageVisualLead/);
  assert.doesNotMatch(source, /const leadSignal = feed\.featured\?\.publicSignal \|\| feed\.items\[0\]\?\.publicSignal/);
  assert.match(source, /provenanceLabel=\{leadSignal\?\.image_provenance_label \|\| ''\}/);
});
