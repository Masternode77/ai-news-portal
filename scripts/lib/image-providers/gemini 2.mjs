import { GEMINI_API_URL, GEMINI_IMAGE_MODEL } from '../constants.mjs';
import {
  extensionForMime,
  fetchWithTimeout,
  imagePromptForItem,
  writeGeneratedImage,
} from './shared.mjs';

export const geminiImageProvider = {
  key: 'gemini',
  label: 'Gemini legacy image API',
  isAvailable({ offline = false } = {}) {
    return Boolean(process.env.GEMINI_API_KEY) && !offline;
  },
  async generate(item, { outDir }) {
    const response = await fetchWithTimeout(`${GEMINI_API_URL}/${GEMINI_IMAGE_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: imagePromptForItem(item),
              },
            ],
          },
        ],
        generationConfig: {
          imageConfig: {
            aspectRatio: '16:9',
          },
        },
      }),
    }, 45000);

    if (!response.ok) {
      throw new Error(`Gemini image request failed: ${response.status}`);
    }

    const payload = await response.json();
    const parts = payload?.candidates?.[0]?.content?.parts || [];
    const inlinePart = parts.find((part) => part.inlineData?.data);

    if (!inlinePart?.inlineData?.data) {
      throw new Error('No image bytes returned by Gemini');
    }

    return writeGeneratedImage(
      outDir,
      item,
      Buffer.from(inlinePart.inlineData.data, 'base64'),
      extensionForMime(inlinePart.inlineData.mimeType),
    );
  },
};
