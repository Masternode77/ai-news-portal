import { GEMINI_API_URL, GEMINI_IMAGE_MODEL } from '../constants.mjs';
import { buildImagePrompt, fetchWithTimeout, writeBase64Image } from './shared.mjs';

export function createGeminiImageProvider() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    name: 'legacy-gemini',
    async generate(item) {
      const response = await fetchWithTimeout(`${GEMINI_API_URL}/${GEMINI_IMAGE_MODEL}:generateContent`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: buildImagePrompt(item),
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

      return writeBase64Image(item, inlinePart.inlineData.data, inlinePart.inlineData.mimeType || 'image/png');
    },
  };
}
