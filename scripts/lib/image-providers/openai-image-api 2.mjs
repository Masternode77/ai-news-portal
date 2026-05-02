import {
  OPENAI_IMAGE_API_URL,
  OPENAI_IMAGE_MODEL,
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

function requestBody(item) {
  const body = {
    model: OPENAI_IMAGE_MODEL,
    prompt: imagePromptForItem(item),
    n: 1,
    size: OPENAI_IMAGE_SIZE,
  };

  if (/^dall-e-/i.test(OPENAI_IMAGE_MODEL)) {
    body.response_format = 'b64_json';
    return body;
  }

  body.quality = OPENAI_IMAGE_QUALITY;
  body.output_format = OPENAI_IMAGE_OUTPUT_FORMAT;
  return body;
}

async function imageBytesFromUrl(url) {
  const response = await fetchWithTimeout(url, {}, 30000);

  if (!response.ok) {
    throw new Error(`OpenAI image URL fetch failed: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export const openaiImageApiProvider = {
  key: 'openai-api',
  label: 'OpenAI Image API',
  isAvailable({ offline = false } = {}) {
    return Boolean(process.env.OPENAI_API_KEY) && !offline;
  },
  async generate(item, { outDir }) {
    const response = await fetchWithTimeout(OPENAI_IMAGE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody(item)),
    }, 60000);

    if (!response.ok) {
      throw new Error(`OpenAI image request failed: ${response.status}`);
    }

    const payload = await response.json();
    const image = payload?.data?.[0];

    if (image?.b64_json) {
      return writeGeneratedImage(
        outDir,
        item,
        Buffer.from(image.b64_json, 'base64'),
        extensionForFormat(OPENAI_IMAGE_OUTPUT_FORMAT),
      );
    }

    if (image?.url) {
      return writeGeneratedImage(outDir, item, await imageBytesFromUrl(image.url), 'png');
    }

    throw new Error('No image bytes returned by OpenAI Image API');
  },
};
