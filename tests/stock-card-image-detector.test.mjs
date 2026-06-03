import assert from 'node:assert/strict';
import test from 'node:test';
import { isStockDerivedCardImage } from '../scripts/lib/stock-card-image-detector.mjs';

test('stock detector flags source-derived local raster card images', () => {
  assert.equal(isStockDerivedCardImage({
    generatedImage: '/generated/example.jpg',
    sourceImage: 'https://stock.example.com/photo.jpg',
  }), true);
});

test('stock detector does not flag SVG placeholders or OpenAI generated rasters', () => {
  assert.equal(isStockDerivedCardImage({
    generatedImage: '/generated/example.svg',
    sourceImage: 'https://stock.example.com/photo.jpg',
  }), false);

  assert.equal(isStockDerivedCardImage({
    generatedImage: '/generated/example.png',
    sourceImage: 'https://stock.example.com/photo.jpg',
    generatedImageProvider: 'openai-api',
  }), false);

  assert.equal(isStockDerivedCardImage({
    generatedImage: '/generated/articles/example/hero.webp',
    sourceImage: 'https://stock.example.com/photo.jpg',
    generatedImageProvider: 'image2',
  }), false);

  assert.equal(isStockDerivedCardImage({
    publicSignal: { image: '/generated/articles/example/thumbnail.webp' },
    generatedImage: '/generated/example.svg',
    sourceImage: 'https://stock.example.com/photo.jpg',
    generatedImageProvider: 'local-placeholder',
  }), false);
});
