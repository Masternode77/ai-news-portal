import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CATEGORY_PAGES } from '../scripts/lib/taxonomy-page-builder.mjs';
import { ensurePublicFallbackImages } from '../scripts/prepare-static-images.mjs';
import {
  articleCardImage,
  articleHeroImage,
  articleImageVariants,
  articleOpenGraphImage,
  fallbackCategoryImagePath,
  isTrustedPublicImage,
  localArticleImageExists,
} from '../scripts/lib/article-image-surface.mjs';

test('category fallback assets cover every public taxonomy lane', async () => {
  const result = await ensurePublicFallbackImages({ publicDir: path.join(process.cwd(), 'public') });
  const fallbackSlugs = [...CATEGORY_PAGES.map(([slug]) => slug), 'ai-infrastructure'];

  assert.equal(result.missing.length, 0);
  for (const slug of fallbackSlugs) {
    const publicPath = `/generated/fallbacks/${slug}.svg`;
    assert.equal(fallbackCategoryImagePath({ category: slug }), publicPath);
    assert.equal(localArticleImageExists(publicPath), true, publicPath);
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public', publicPath.replace(/^\//, ''))), publicPath);
  }
});

test('article image variants surface remote source artwork with source metadata', () => {
  const article = {
    id: 'remote_only_image_fixture',
    title: 'Utility interconnect delays reset AI campus timing',
    category: 'Power & Grid',
    sourceImage: 'https://example.com/remote-source-image.jpg',
  };

  const variants = articleImageVariants(article);

  assert.equal(isTrustedPublicImage(article.sourceImage), false);
  assert.equal(variants.thumbnail.url, article.sourceImage);
  assert.equal(variants.thumbnail.status, 'source');
  assert.equal(variants.thumbnail.provider, 'source-image');
  assert.equal(variants.hero.url, article.sourceImage);
  assert.equal(variants.og.url, article.sourceImage);
  assert.equal(articleCardImage(article), variants.thumbnail.url);
  assert.equal(articleHeroImage(article), variants.hero.url);
  assert.equal(articleOpenGraphImage(article), variants.og.url);
});

test('public image components are wired through card and OpenGraph surfaces', () => {
  const cardImageSource = fs.readFileSync(new URL('../src/components/ArticleCardImage.astro', import.meta.url), 'utf8');
  const openGraphSource = fs.readFileSync(new URL('../src/components/OpenGraphImage.astro', import.meta.url), 'utf8');
  const cardSource = fs.readFileSync(new URL('../src/components/ArticleCard.astro', import.meta.url), 'utf8');
  const featuredSource = fs.readFileSync(new URL('../src/components/FeaturedArticle.astro', import.meta.url), 'utf8');
  const layoutSource = fs.readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');

  assert.match(cardImageSource, /class=\{className\}/);
  assert.match(cardImageSource, /article-card-image/);
  assert.match(openGraphSource, /og:image/);
  assert.match(openGraphSource, /twitter:image/);
  assert.match(cardSource, /ArticleCardImage/);
  assert.match(featuredSource, /ArticleCardImage/);
  assert.match(layoutSource, /OpenGraphImage/);
});
