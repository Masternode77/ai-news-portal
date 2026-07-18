import {
  OPENAI_IMAGE_API_URL,
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
} from '../constants.mjs';
import { articleImageAltText } from '../article-image-prompt.mjs';
import { writeArticleImageSetFromBytes } from '../image-store.mjs';
import {
  buildImagePrompt,
  fetchWithTimeout,
  SUPPORTED_RASTER_MIME_TYPES,
} from './shared.mjs';

const MAX_PROVIDER_IMAGE_BYTES = 16 * 1024 * 1024;

function mimeTypeForFormat(format = 'png') {
  if (format === 'jpeg' || format === 'jpg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

export function extractOpenAiImagePayload(payload = {}, fallbackMime = 'image/png') {
  const image = payload?.data?.[0] || {};
  return {
    base64: image.b64_json || payload.b64_json || '',
    url: image.url || payload.url || '',
    mimeType: image.mime_type || payload.mime_type || fallbackMime,
    raw: payload,
  };
}

export async function requestOpenAiImage(options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for OpenAI image generation');
  }

  const outputFormat = options.outputFormat || 'png';
  const response = await fetchWithTimeout(OPENAI_IMAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || OPENAI_IMAGE_MODEL,
      prompt: options.prompt,
      n: 1,
      size: options.size || OPENAI_IMAGE_SIZE,
      quality: options.quality || OPENAI_IMAGE_QUALITY,
      output_format: outputFormat,
      ...(options.background ? { background: options.background } : {}),
    }),
  }, options.timeoutMs || 45000);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI image request failed: ${response.status}${detail ? ` ${detail.slice(0, 400)}` : ''}`);
  }

  const payload = await response.json();
  const image = extractOpenAiImagePayload(payload, mimeTypeForFormat(outputFormat));

  if (image.base64) {
    return {
      bytes: Buffer.from(image.base64, 'base64'),
      mimeType: image.mimeType,
      raw: image.raw,
    };
  }

  if (image.url) {
    const imageResponse = await fetchWithTimeout(image.url, {
      safeFetch: {
        allowedMimeTypes: SUPPORTED_RASTER_MIME_TYPES,
        maxCompressedBytes: MAX_PROVIDER_IMAGE_BYTES,
        maxDecompressedBytes: MAX_PROVIDER_IMAGE_BYTES,
        maxRedirects: 3,
      },
    }, 20000);
    if (!imageResponse.ok) {
      throw new Error(`Generated image fetch failed: ${imageResponse.status}`);
    }
    return {
      bytes: Buffer.from(await imageResponse.arrayBuffer()),
      mimeType: imageResponse.headers.get('content-type') || image.mimeType,
      raw: image.raw,
    };
  }

  throw new Error('No image bytes returned by OpenAI image API');
}

export function createOpenAiImageApiProvider(options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = options.model || OPENAI_IMAGE_MODEL;
  const requestImage = options.requestImage || requestOpenAiImage;
  const generateSet = async (item) => {
    const prompt = buildImagePrompt(item);
    const image = await requestImage({
      apiKey,
      model,
      prompt,
      size: OPENAI_IMAGE_SIZE,
      quality: OPENAI_IMAGE_QUALITY,
    });

    return writeArticleImageSetFromBytes(item, image.bytes, {
      provider: 'openai-api',
      model,
      prompt,
      alt: item.imageAlt || articleImageAltText(item),
      generatedAt: new Date().toISOString(),
      status: 'generated',
      error: '',
    }, { publicDir: options.publicDir, mimeType: image.mimeType });
  };

  return {
    name: 'openai-api',
    model,
    async generate(item) {
      return (await generateSet(item)).heroImage;
    },
    async generateWithMetadata(item) {
      return generateSet(item);
    },
  };
}
