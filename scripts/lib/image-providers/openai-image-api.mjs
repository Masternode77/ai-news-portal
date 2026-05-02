import {
  OPENAI_IMAGE_API_URL,
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
} from '../constants.mjs';
import { buildImagePrompt, fetchWithTimeout, writeBase64Image, writeFetchedImage } from './shared.mjs';

export function createOpenAiImageApiProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    name: 'openai-api',
    async generate(item) {
      const response = await fetchWithTimeout(OPENAI_IMAGE_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_IMAGE_MODEL,
          prompt: buildImagePrompt(item),
          n: 1,
          size: OPENAI_IMAGE_SIZE,
          quality: OPENAI_IMAGE_QUALITY,
        }),
      }, 45000);

      if (!response.ok) {
        throw new Error(`OpenAI image request failed: ${response.status}`);
      }

      const payload = await response.json();
      const image = payload?.data?.[0] || {};

      if (image.b64_json) {
        return writeBase64Image(item, image.b64_json, image.mime_type || 'image/png');
      }

      if (image.url) {
        return writeFetchedImage(item, image.url);
      }

      throw new Error('No image bytes returned by OpenAI image API');
    },
  };
}
