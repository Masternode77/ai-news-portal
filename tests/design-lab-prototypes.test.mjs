import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  DESIGN_LAB_ARTICLE,
  DESIGN_LAB_STORIES,
  DESIGN_LAB_THEMES,
} from '../src/lib/design-lab-data.js';
import {
  expectedCaptures,
  themes as visualThemes,
  viewports as visualViewports,
  views as visualViews,
} from '../scripts/qa-design-lab-visual.mjs';

const ROOT = path.resolve(process.cwd());
const REQUIRED_VIEWS = ['index.html', 'article/index.html', 'states/index.html', 'navigation/index.html'];
const INTERNAL_COPY = /relevance score|extraction score|article blueprint|pipeline version|generation version|qualifying signal|deskwork|signal stream|source stream/i;

test('design lab shares one source-grounded dataset with unique local imagery', () => {
  assert.equal(DESIGN_LAB_THEMES.length, 3);
  assert.ok(DESIGN_LAB_STORIES.length >= 8);
  assert.ok(DESIGN_LAB_ARTICLE.body.length >= 8);

  const images = DESIGN_LAB_STORIES.map((story) => story.image);
  assert.equal(new Set(images).size, images.length);
  for (const story of DESIGN_LAB_STORIES) {
    assert.match(story.sourceUrl, /^https:\/\//);
    assert.match(
      story.image,
      /^\/generated\/(?:articles\/.+\.webp|design-lab\/.+\.(?:jpe?g|png))$/,
    );
    assert.ok(story.imageAlt.length > 20);
    assert.equal(fs.existsSync(path.join(ROOT, 'public', story.image.replace(/^\//, ''))), true);
    assert.doesNotMatch(`${story.deck} ${story.decision}`, INTERNAL_COPY);
  }
});

test('design lab visual QA covers every theme, view, and target viewport', () => {
  assert.deepEqual(visualThemes.map(({ slug }) => slug), DESIGN_LAB_THEMES.map(({ slug }) => slug));
  assert.deepEqual(visualViews.map(({ name }) => name), ['home', 'article', 'states', 'navigation']);
  assert.deepEqual(visualViewports.map(({ name }) => name), ['desktop', 'tablet', 'mobile']);
  assert.equal(expectedCaptures, 36);
});

test('built design options expose homepage, article, state, and navigation views without internal metadata', () => {
  for (const theme of DESIGN_LAB_THEMES) {
    for (const view of REQUIRED_VIEWS) {
      const outputPath = path.join(ROOT, 'dist', 'design-lab', theme.slug, view);
      assert.equal(fs.existsSync(outputPath), true, `missing ${outputPath}`);
      const html = fs.readFileSync(outputPath, 'utf8');
      assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
      assert.match(html, new RegExp(`data-design-theme="${theme.slug}"`));
      assert.doesNotMatch(html, INTERNAL_COPY);
      assert.doesNotMatch(html, /href="\/admin(?:\/|\.)/i);
    }

    const homepage = fs.readFileSync(path.join(ROOT, 'dist', 'design-lab', theme.slug, 'index.html'), 'utf8');
    const imageSources = [...homepage.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(imageSources.length >= 5, `${theme.slug} should render at least five images`);
    assert.equal(new Set(imageSources).size, imageSources.length, `${theme.slug} repeats a visible image`);
    assert.match(homepage, new RegExp(`/design-lab/${theme.slug}/article/`));
    assert.match(homepage, new RegExp(`/design-lab/${theme.slug}/states/`));
    assert.match(homepage, new RegExp(`/design-lab/${theme.slug}/navigation/`));

    const navigation = fs.readFileSync(path.join(ROOT, 'dist', 'design-lab', theme.slug, 'navigation', 'index.html'), 'utf8');
    assert.match(navigation, /data-navigation-state-view/);
    assert.match(navigation, /data-nav-state="default"/);
    assert.match(navigation, /data-nav-state="current"/);
    assert.match(navigation, /data-nav-state="focus-visible"/);
    assert.match(navigation, new RegExp(`/design-lab/${theme.slug}/navigation/`));
  }

  const sitemapFiles = fs.readdirSync(path.join(ROOT, 'dist'))
    .filter((filename) => /^sitemap(?:-index|-\d+)?\.xml$/.test(filename));
  assert.ok(sitemapFiles.length > 0, 'expected at least one generated sitemap');
  for (const filename of sitemapFiles) {
    const sitemap = fs.readFileSync(path.join(ROOT, 'dist', filename), 'utf8');
    assert.doesNotMatch(
      sitemap,
      /\/design-lab\//,
      `noindex design prototypes must stay out of ${filename}`,
    );
  }
});
