import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { isStockDerivedCardImage } from '../scripts/lib/stock-card-image-detector.mjs';
import {
  articleCardImage,
  articleDisplayImage,
  articleHeroImage,
  articleImageProvenance,
  articleImageVariants,
  articleOpenGraphImage,
  isRemoteImage,
  isTrustedPublicImage,
  localArticleImageExists,
} from '../scripts/lib/article-image-surface.mjs';
import { buildPublicPresentation } from '../scripts/lib/public-presentation.mjs';
import { registerPublicImageAuditContractTests } from './public-image-audit-contracts.mjs';

const HPCWIRE_REMOTE_IMAGE_REGRESSION_IDS = [
  '0ccf1e3f69f2b513',
  '0737340e51a0cfb0',
  'e40a1864f5a8b8e8',
  '4d21b727a5d2e275',
  'cf753845198cd7d0',
];
const FORBIDDEN_VISIBLE_PROVENANCE_LABELS = /ChatGPT Image2 visual|Editorial visual|Original source image/;

function assertPublicImage2Provenance(provenance, expected) {
  assert.equal(typeof provenance.label, 'string');
  assert.notEqual(provenance.label.length, 0);
  assert.equal(provenance.kind, 'image2');
  assert.equal(provenance.provider, expected.provider);
  assert.equal(provenance.status, expected.status);
  assert.equal(provenance.variant, expected.variant);
}

test('public feed cards carry displayable editorial images', () => {
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });
  assert.ok(feed.items.length >= 30);
  assert.equal(feed.items.filter((item) => !item.publicSignal?.image).length, 0);
  assert.equal(feed.items.filter((item) => !item.publicSignal?.image_alt).length, 0);
  assert.equal(feed.items.filter((item) => isStockDerivedCardImage(item.publicSignal)).length, 0);
  assert.equal(feed.items.filter((item) => {
    const image = item.publicSignal?.image;
    return !isTrustedPublicImage(image) && !isRemoteImage(image);
  }).length, 0);
});

test('remote source artwork is normalized to local generated cards', () => {
  const allArticles = [...latestNews, ...archivedNews];
  const affected = allArticles.filter((article) => {
    return isRemoteImage(article.sourceImage)
      && localArticleImageExists(article.generatedImage)
      && localArticleImageExists(article.thumbnailImage);
  });

  assert.ok(affected.length >= 5);

  for (const article of affected) {
    assert.equal(localArticleImageExists(article.generatedImage), true, article.id);
    assert.equal(isRemoteImage(articleCardImage(article)), false, article.id);
    assert.equal(articleCardImage(article), article.thumbnailImage, article.id);
    assert.equal(articleDisplayImage(article), article.generatedImage, article.id);
  }

  const feed = buildHomepageFeed(allArticles, { limit: 50, minimumVisible: 30 });

  assert.equal(feed.items.some((item) => isRemoteImage(item.publicSignal?.image)), false);
});

test('article card and header templates render images', () => {
  const cardSource = fs.readFileSync(new URL('../src/components/ArticleCard.astro', import.meta.url), 'utf8');
  const cardImageSource = fs.readFileSync(new URL('../src/components/ArticleCardImage.astro', import.meta.url), 'utf8');
  const cardWrapperSource = fs.readFileSync(new URL('../src/components/ArticleListCard.astro', import.meta.url), 'utf8');
  const heroImageSource = fs.readFileSync(new URL('../src/components/ArticleHeroImage.astro', import.meta.url), 'utf8');
  const featuredSource = fs.readFileSync(new URL('../src/components/FeaturedArticle.astro', import.meta.url), 'utf8');
  const signalCardSource = fs.readFileSync(new URL('../src/components/PublicSignalCard.astro', import.meta.url), 'utf8');
  const articlePageSource = fs.readFileSync(new URL('../src/pages/news/[id].astro', import.meta.url), 'utf8');

  assert.match(cardSource, /ArticleCardImage/);
  assert.match(cardSource, /provenanceLabel=\{provenanceLabel\}/);
  assert.match(cardImageSource, /class=\{className\}/);
  assert.match(cardImageSource, /data-image-provenance/);
  assert.match(cardWrapperSource, /ArticleCard/);
  assert.match(heroImageSource, /class="article-hero-image/);
  assert.match(heroImageSource, /data-image-provenance/);
  assert.doesNotMatch(heroImageSource, /article-image-provenance/);
  assert.doesNotMatch(heroImageSource, /\{provenanceLabel\}/);
  assert.match(featuredSource, /provenanceLabel=\{provenanceLabel\}/);
  assert.match(signalCardSource, /ArticleCardImage/);
  assert.match(signalCardSource, /provenanceLabel=\{provenanceLabel\}/);
  assert.match(articlePageSource, /articleHeroImage/);
  assert.match(articlePageSource, /articleOpenGraphImage/);
  assert.match(articlePageSource, /articleImageProvenance/);
});

test('article card image keeps provenance metadata non-visible', () => {
  const cardImageSource = fs.readFileSync(new URL('../src/components/ArticleCardImage.astro', import.meta.url), 'utf8');

  assert.match(cardImageSource, /data-image-provenance/);
  assert.match(cardImageSource, /data-provenance-kind/);
  assert.doesNotMatch(cardImageSource, /\{displayProvenanceLabel\}|\{provenanceLabel\}/);
});

test('article hero image keeps provenance metadata non-visible', () => {
  const heroImageSource = fs.readFileSync(new URL('../src/components/ArticleHeroImage.astro', import.meta.url), 'utf8');

  assert.match(heroImageSource, /data-image-provenance/);
  assert.match(heroImageSource, /data-provenance-kind/);
  assert.doesNotMatch(heroImageSource, /article-image-provenance/);
  assert.doesNotMatch(heroImageSource, /\{provenanceLabel\}/);
});

test('public feed carries non-visible publication image provenance metadata', () => {
  const feed = buildHomepageFeed([...latestNews, ...archivedNews], { limit: 50, minimumVisible: 30 });
  const publicSignals = feed.items.map((item) => item.publicSignal);
  const visibleSignalCopy = publicSignals.map((signal) => ({
    title: signal.title,
    deck: signal.deck,
    why_it_matters: signal.why_it_matters,
    image_alt: signal.image_alt,
    source: signal.source,
    cta: signal.cta,
  }));

  assert.ok(publicSignals.length >= 30);
  assert.equal(publicSignals.every((signal) => signal.image_provenance_label), true);
  assert.equal(publicSignals.every((signal) => signal.image_provenance_kind), true);
  assert.equal(publicSignals.some((signal) => signal.image_provenance_kind === 'image2'), true);
  assert.doesNotMatch(JSON.stringify(visibleSignalCopy), FORBIDDEN_VISIBLE_PROVENANCE_LABELS);
});

test('public presentation fails closed instead of using generic terminal copy', () => {
  const presentation = buildPublicPresentation({
    id: 'unsafe-public-presentation-copy',
    title: 'Extraction threshold routing decision',
    source: 'Relevance score',
    primary_category: 'Qualification',
    infrastructure_layer: 'qualification',
    deck: 'The extraction threshold routing decision did not qualify.',
    why_it_matters: 'The source evidence was too thin for a publish decision.',
    public_presentation: {
      deck: 'The extraction threshold routing decision did not qualify.',
      why_it_matters: 'The source evidence was too thin for a publish decision.',
    },
  });

  assert.notEqual(presentation.deck, 'AI infrastructure update.');
  assert.notEqual(presentation.why_it_matters, 'AI infrastructure update.');
  assert.equal(presentation.deck, '');
  assert.equal(presentation.why_it_matters, '');
});

test('article image surface keeps public imagery Image2-centered when only source artwork exists', () => {
  const article = {
    id: 'image_surface_fixture',
    title: 'Utility capacity queue forces new AI campus timing',
    category: 'Power & Grid',
    sourceImage: 'https://example.com/source-only-image.jpg',
  };

  const variants = articleImageVariants(article);

  assert.equal(articleCardImage(article), '/generated/fallbacks/power-grid.svg');
  assert.equal(articleHeroImage(article), '/generated/fallbacks/power-grid.svg');
  assert.equal(articleOpenGraphImage(article), '/generated/fallbacks/power-grid.svg');
  assert.equal(variants.thumbnail.status, 'fallback');
  assert.equal(variants.thumbnail.provider, 'category-fallback');
  assertPublicImage2Provenance(articleImageProvenance(article, 'thumbnail'), {
    provider: 'category-fallback',
    status: 'fallback',
    variant: 'thumbnail',
  });

  const presentation = buildPublicPresentation(article);
  assert.equal(presentation.id, article.id);
  assert.equal(presentation.image, '/generated/fallbacks/power-grid.svg');
  assert.equal(presentation.image_status, 'fallback');
  assert.equal(typeof presentation.image_provenance_label, 'string');
  assert.notEqual(presentation.image_provenance_label.length, 0);
  assert.equal(presentation.image_provenance_kind, 'image2');
  assert.match(presentation.image_alt, /Utility capacity queue/);
});

test('article image surface prefers local generated images over source artwork', () => {
  const article = {
    id: 'ea7c824f9474271e',
    title: 'GITEX AI EUROPE',
    category: 'Data Centers',
    sourceImage: 'https://example.com/gitex-source.jpg',
    generatedImage: '/generated/ea7c824f9474271e.svg',
    generatedImageProvider: 'local-placeholder',
    generatedImageModel: 'local-svg',
  };

  const variants = articleImageVariants(article);

  assert.equal(articleDisplayImage(article), article.generatedImage);
  assert.equal(articleCardImage(article), article.generatedImage);
  assert.equal(articleHeroImage(article), article.generatedImage);
  assert.equal(articleOpenGraphImage(article), article.generatedImage);
  assert.equal(variants.thumbnail.status, 'placeholder');
  assert.equal(variants.thumbnail.provider, 'local-placeholder');
  assertPublicImage2Provenance(articleImageProvenance(article, 'thumbnail'), {
    provider: 'local-placeholder',
    status: 'placeholder',
    variant: 'thumbnail',
  });
});

test('article image surface prefers canonical image2 hero metadata', () => {
  const article = {
    id: 'image_surface_image2_fixture',
    title: 'Transformer lead times reshape AI campus siting',
    heroImage: '/generated/fallbacks/data-centers.svg',
    thumbnailImage: '/generated/fallbacks/cloud-capacity.svg',
    ogImage: '/generated/fallbacks/semiconductors.svg',
    sourceImage: 'https://example.com/source-should-not-win-over-image2.jpg',
    generatedImageProvider: 'image2',
    imageAlt: 'Editorial image for transformer lead times',
  };

  assert.equal(articleDisplayImage(article), article.heroImage);
  assert.equal(articleHeroImage(article), article.heroImage);
  assert.equal(articleCardImage(article), article.thumbnailImage);
  assert.equal(articleOpenGraphImage(article), article.ogImage);

  const presentation = buildPublicPresentation(article);
  assert.equal(presentation.image, article.thumbnailImage);
  assert.equal(presentation.image_alt, article.imageAlt);
  assert.equal(typeof presentation.image_provenance_label, 'string');
  assert.notEqual(presentation.image_provenance_label.length, 0);
  assert.equal(presentation.image_provenance_kind, 'image2');
});

test('article image provenance labels fallback and missing metadata as image2 visuals', () => {
  const article = {
    id: 'image_surface_fallback_fixture',
    title: 'Unmapped AI infrastructure signal',
  };

  assertPublicImage2Provenance(articleImageProvenance(article, 'thumbnail'), {
    provider: 'category-fallback',
    status: 'fallback',
    variant: 'thumbnail',
  });

  const presentation = buildPublicPresentation(article);
  assert.equal(typeof presentation.image_provenance_label, 'string');
  assert.notEqual(presentation.image_provenance_label.length, 0);
  assert.equal(presentation.image_provenance_kind, 'image2');
});

registerPublicImageAuditContractTests();
