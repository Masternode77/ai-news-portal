import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleCardImage,
  articleHeroImage,
  articleImageVariants,
  articleOpenGraphImage,
} from '../scripts/lib/article-image-surface.mjs';

test('article image surface uses source artwork when no generated image exists', () => {
  const article = {
    id: 'remote_only_image_fixture',
    title: 'Utility interconnect delays reset AI campus timing',
    category: 'Power & Grid',
    sourceImage: 'https://example.com/remote-source-image.jpg',
  };

  const variants = articleImageVariants(article);

  assert.equal(articleCardImage(article), article.sourceImage);
  assert.equal(articleHeroImage(article), article.sourceImage);
  assert.equal(articleOpenGraphImage(article), article.sourceImage);
  assert.equal(variants.thumbnail.status, 'source');
  assert.equal(variants.thumbnail.provider, 'source-image');
});

test('article image surface prefers source artwork over local placeholder cards', () => {
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

  assert.equal(articleCardImage(article), article.sourceImage);
  assert.equal(articleHeroImage(article), article.sourceImage);
  assert.equal(articleOpenGraphImage(article), article.sourceImage);
  assert.equal(variants.thumbnail.status, 'source');
  assert.equal(variants.thumbnail.provider, 'source-image');
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
