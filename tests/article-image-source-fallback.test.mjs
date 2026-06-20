import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleCardImage,
  articleHeroImage,
  articleImageVariants,
  articleOpenGraphImage,
} from '../scripts/lib/article-image-surface.mjs';

test('article image surface uses category fallback until source artwork is canonicalized', () => {
  const article = {
    id: 'remote_only_image_fixture',
    title: 'Utility interconnect delays reset AI campus timing',
    category: 'Power & Grid',
    sourceImage: 'https://example.com/remote-source-image.jpg',
  };

  const variants = articleImageVariants(article);

  assert.equal(articleCardImage(article), '/generated/fallbacks/power-grid.svg');
  assert.equal(articleHeroImage(article), '/generated/fallbacks/power-grid.svg');
  assert.equal(articleOpenGraphImage(article), '/generated/fallbacks/power-grid.svg');
  assert.equal(variants.thumbnail.status, 'fallback');
  assert.equal(variants.thumbnail.provider, 'category-fallback');
  assert.equal(variants.thumbnail.fallback, true);
});

test('article image surface prefers local placeholder cards over unvalidated source artwork', () => {
  const article = {
    id: 'placeholder_with_source_fixture',
    title: 'GITEX AI EUROPE',
    category: 'Data Centers',
    sourceImage: 'https://example.com/gitex-source.jpg',
    generatedImage: '/generated/fallbacks/data-centers.svg',
    generatedImageProvider: 'local-placeholder',
    generatedImageModel: 'local-svg',
  };

  const variants = articleImageVariants(article);

  assert.equal(articleCardImage(article), article.generatedImage);
  assert.equal(articleHeroImage(article), article.generatedImage);
  assert.equal(articleOpenGraphImage(article), article.generatedImage);
  assert.equal(variants.thumbnail.status, 'placeholder');
  assert.equal(variants.thumbnail.provider, 'local-placeholder');
  assert.equal(variants.thumbnail.fallback, true);
});

test('article image surface keeps image2 artwork ahead of source artwork', () => {
  const article = {
    id: 'image2_with_source_fixture',
    title: 'Transformer lead times reshape AI campus siting',
    heroImage: '/generated/fallbacks/data-centers.svg',
    thumbnailImage: '/generated/fallbacks/cloud-capacity.svg',
    ogImage: '/generated/fallbacks/semiconductors.svg',
    sourceImage: 'https://example.com/source-should-not-win-over-image2.jpg',
    generatedImageProvider: 'image2',
  };

  assert.equal(articleHeroImage(article), article.heroImage);
  assert.equal(articleCardImage(article), article.thumbnailImage);
  assert.equal(articleOpenGraphImage(article), article.ogImage);
});

test('article image surface uses canonical article variants ahead of source artwork', () => {
  const article = {
    id: '94f36086ed1f0aa2',
    title: 'Intel swipes Qualcomm veteran of 25 years to lead client computing Alex Katouzian jumps ship',
    sourceImage: 'https://example.com/source-should-not-win-over-canonical.jpg',
  };

  assert.equal(
    articleHeroImage(article),
    '/generated/articles/94f36086ed1f0aa2-intel-swipes-qualcomm-veteran-of-25-years-to-lead-client-computing-alex-katouzian-jumps-sh/hero.webp',
  );
  assert.equal(
    articleCardImage(article),
    '/generated/articles/94f36086ed1f0aa2-intel-swipes-qualcomm-veteran-of-25-years-to-lead-client-computing-alex-katouzian-jumps-sh/thumbnail.webp',
  );
  assert.equal(
    articleOpenGraphImage(article),
    '/generated/articles/94f36086ed1f0aa2-intel-swipes-qualcomm-veteran-of-25-years-to-lead-client-computing-alex-katouzian-jumps-sh/og.webp',
  );
});

test('article image surface treats explicit fallback SVGs as placeholders even with AI metadata', () => {
  const article = {
    id: 'fallback_svg_with_ai_metadata_fixture',
    title: 'Campus power queues reshape accelerator deployment',
    category: 'Power & Grid',
    sourceImage: 'https://example.com/unvalidated-source-image.jpg',
    generatedImage: '/generated/fallbacks/power-grid.svg',
    generatedImageProvider: 'image2',
    generatedImageModel: 'gpt-image-1',
    imageModel: 'openai-image',
  };

  const variants = articleImageVariants(article);

  assert.equal(articleCardImage(article), article.generatedImage);
  assert.equal(articleHeroImage(article), article.generatedImage);
  assert.equal(articleOpenGraphImage(article), article.generatedImage);
  assert.equal(variants.thumbnail.status, 'placeholder');
  assert.equal(variants.thumbnail.fallback, true);
});
