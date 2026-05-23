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
});
