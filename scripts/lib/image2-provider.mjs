import path from 'node:path';
import { OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY, PIPELINE_OFFLINE } from './constants.mjs';
import { articleImageAltText, buildArticleImagePrompt } from './article-image-prompt.mjs';
import { requestOpenAiImage } from './image-providers/openai-image-api.mjs';
import { writeArticleImageSetFromBytes, writeFallbackArticleImageSet } from './image-store.mjs';

const DEFAULT_IMAGE2_SIZE = process.env.IMAGE2_HERO_SIZE || '1536x864';
const DEFAULT_IMAGE2_FORMAT = process.env.IMAGE2_OUTPUT_FORMAT || 'webp';

function nowIso(now = () => new Date()) {
  return now().toISOString();
}

function metadataBase(article = {}, options = {}) {
  return {
    provider: 'image2',
    model: options.model || OPENAI_IMAGE_MODEL || 'gpt-image-2',
    prompt: options.prompt || buildArticleImagePrompt(article),
    alt: options.alt || articleImageAltText(article),
    generatedAt: nowIso(options.now),
  };
}

export function metadataPatchFromImageSet(result = {}) {
  return {
    generatedImage: result.heroImage || '',
    heroImage: result.heroImage || '',
    thumbnailImage: result.thumbnailImage || '',
    ogImage: result.ogImage || '',
    legacyImage: result.legacyImage || '',
    imagePrompt: result.prompt || '',
    imageAlt: result.alt || '',
    generatedImageProvider: result.provider || 'image2',
    generatedImageModel: result.model || OPENAI_IMAGE_MODEL || 'gpt-image-2',
    imageProvider: result.provider || 'image2',
    imageModel: result.model || OPENAI_IMAGE_MODEL || 'gpt-image-2',
    imageStatus: result.status || '',
    imageError: result.error || '',
    imageGeneratedAt: result.generatedAt || '',
  };
}

export async function generateArticleImageSet(article = {}, options = {}) {
  const base = metadataBase(article, options);
  const publicDir = options.publicDir || process.env.IMAGE2_PUBLIC_DIR || path.join(process.cwd(), 'public');
  const offline = options.offline ?? PIPELINE_OFFLINE;
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (offline || !apiKey) {
    if (options.throwOnError) {
      throw new Error(offline
        ? 'PIPELINE_OFFLINE prevents Image2 generation'
        : 'OPENAI_API_KEY is required for Image2 generation');
    }
    return writeFallbackArticleImageSet(article, {
      ...base,
      provider: 'local-placeholder',
      model: 'local-raster',
      status: 'fallback',
      error: offline ? 'PIPELINE_OFFLINE enabled; wrote local fallback image set.' : 'OPENAI_API_KEY missing; wrote local fallback image set.',
    }, { publicDir });
  }

  try {
    const requestImage = options.requestImage || requestOpenAiImage;
    const image = await requestImage({
      apiKey,
      model: base.model,
      prompt: base.prompt,
      size: options.size || DEFAULT_IMAGE2_SIZE,
      quality: options.quality || OPENAI_IMAGE_QUALITY || 'medium',
      outputFormat: options.outputFormat || DEFAULT_IMAGE2_FORMAT,
      background: 'opaque',
      timeoutMs: options.timeoutMs || 120000,
    });

    return writeArticleImageSetFromBytes(article, image.bytes, {
      ...base,
      status: 'generated',
      error: '',
    }, { publicDir });
  } catch (error) {
    if (options.throwOnError) throw error;
    return writeFallbackArticleImageSet(article, {
      ...base,
      provider: 'local-placeholder',
      model: 'local-raster',
      status: 'fallback',
      error: error?.message || 'OpenAI image request failed; wrote local fallback image set.',
    }, { publicDir });
  }
}

export function createImage2Provider(options = {}) {
  const offline = options.offline ?? PIPELINE_OFFLINE;
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (offline || !apiKey) return null;

  const generationOptions = {
    ...options,
    apiKey,
    offline: false,
    throwOnError: true,
  };
  return {
    name: 'image2',
    model: generationOptions.model || OPENAI_IMAGE_MODEL || 'gpt-image-2',
    async generate(item) {
      const result = await generateArticleImageSet(item, generationOptions);
      return result.heroImage;
    },
    async generateWithMetadata(item) {
      return generateArticleImageSet(item, generationOptions);
    },
  };
}
