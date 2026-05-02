import {
  CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN,
  CHATGPT_IMAGE_OAUTH_ENDPOINT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
} from '../constants.mjs';
import { buildImagePrompt, fetchWithTimeout, writeBase64Image, writeFetchedImage } from './shared.mjs';

function extractImagePayload(payload) {
  const firstData = payload?.data?.[0] || {};
  return {
    base64:
      payload?.imageBase64 ||
      payload?.b64_json ||
      payload?.b64Json ||
      firstData?.b64_json ||
      firstData?.b64Json ||
      firstData?.imageBase64 ||
      null,
    url: payload?.imageUrl || payload?.url || firstData?.url || null,
    mimeType: payload?.mimeType || payload?.mime || firstData?.mimeType || 'image/png',
  };
}

export function createChatGptOauthRuntimeProvider() {
  if (!CHATGPT_IMAGE_OAUTH_ENDPOINT || !CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN) {
    return null;
  }

  return {
    name: 'chatgpt',
    async generate(item) {
      const response = await fetchWithTimeout(CHATGPT_IMAGE_OAUTH_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: buildImagePrompt(item),
          article: {
            id: item.id,
            title: item.title,
            summary: item.summary || item.snippet || '',
            category: item.category || '',
            source: item.source || '',
            url: item.url || '',
          },
          image: {
            size: OPENAI_IMAGE_SIZE,
            quality: OPENAI_IMAGE_QUALITY,
            aspectRatio: '16:9',
          },
        }),
      }, 45000);

      if (!response.ok) {
        throw new Error(`ChatGPT image runtime request failed: ${response.status}`);
      }

      const payload = await response.json();
      const image = extractImagePayload(payload);

      if (image.base64) {
        return writeBase64Image(item, image.base64, image.mimeType);
      }

      if (image.url) {
        return writeFetchedImage(item, image.url, {
          Authorization: `Bearer ${CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN}`,
        });
      }

      throw new Error('No image bytes returned by ChatGPT image runtime');
    },
  };
}
