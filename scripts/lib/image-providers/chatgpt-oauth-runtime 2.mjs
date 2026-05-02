import {
  CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN,
  CHATGPT_IMAGE_OAUTH_ENDPOINT,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
} from '../constants.mjs';
import {
  extensionForFormat,
  fetchWithTimeout,
  imagePromptForItem,
  writeGeneratedImage,
} from './shared.mjs';

export const chatgptOauthRuntimeProvider = {
  key: 'chatgpt-oauth',
  label: 'ChatGPT/OpenAI OAuth runtime',
  isAvailable({ offline = false } = {}) {
    return Boolean(CHATGPT_IMAGE_OAUTH_ENDPOINT && CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN) && !offline;
  },
  async generate(item, { outDir }) {
    const response = await fetchWithTimeout(CHATGPT_IMAGE_OAUTH_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: imagePromptForItem(item),
        size: OPENAI_IMAGE_SIZE,
        quality: OPENAI_IMAGE_QUALITY,
        output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
        metadata: {
          articleId: item.id,
          source: 'ai-news-portal',
        },
      }),
    }, 60000);

    if (!response.ok) {
      throw new Error(`ChatGPT OAuth image runtime request failed: ${response.status}`);
    }

    const payload = await response.json();
    const image = payload?.data?.[0] || payload?.image || payload;
    const b64 = image?.b64_json || image?.base64 || image?.result;

    if (!b64) {
      throw new Error('No image bytes returned by ChatGPT OAuth image runtime');
    }

    return writeGeneratedImage(
      outDir,
      item,
      Buffer.from(b64, 'base64'),
      extensionForFormat(image?.output_format || OPENAI_IMAGE_OUTPUT_FORMAT),
    );
  },
};
