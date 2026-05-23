const RASTER_IMAGE_RE = /\.(?:jpe?g|png|webp)(?:$|[?#])/i;
const LOCAL_GENERATED_RE = /^\/generated\//i;

const AI_IMAGE_PROVIDERS = new Set([
  'chatgpt',
  'openai-api',
  'gpt-image',
  'gpt-image-2',
  'gpt-image-1',
  'gpt-image-1.5',
  'gpt-image-1-mini',
]);

export function imageProviderLooksAi(provider = '') {
  const normalized = String(provider || '').trim().toLowerCase();
  if (!normalized) return false;
  return AI_IMAGE_PROVIDERS.has(normalized) || normalized.includes('gpt-image') || normalized.includes('openai');
}

export function isLocalGeneratedRaster(image = '') {
  const value = String(image || '').trim();
  return LOCAL_GENERATED_RE.test(value) && RASTER_IMAGE_RE.test(value);
}

export function isStockDerivedCardImage(article = {}) {
  const generatedImage = article.publicSignal?.image || article.generatedImage || article.image || '';
  if (!isLocalGeneratedRaster(generatedImage)) return false;
  if (imageProviderLooksAi(article.generatedImageProvider || article.imageProvider || article.image_source_provider)) return false;
  return Boolean(article.sourceImage || article.imageUrl || article.image_url || article.thumbnail);
}

export function stockDerivedImageReason(article = {}) {
  if (!isStockDerivedCardImage(article)) return '';
  return `source-derived raster image: ${article.generatedImage || article.publicSignal?.image}`;
}
