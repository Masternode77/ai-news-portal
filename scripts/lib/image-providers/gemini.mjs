import { GEMINI_API_URL, GEMINI_IMAGE_MODEL } from '../constants.mjs';
import { articleImageAltText } from '../article-image-prompt.mjs';
import { writeArticleImageSetFromBytes } from '../image-store.mjs';
import { buildImagePrompt, fetchWithTimeout } from './shared.mjs';

export function createGeminiImageProvider(options = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = options.model || GEMINI_IMAGE_MODEL;
  const request = options.request || fetchWithTimeout;
  const generateSet = async (item) => {
    const prompt = buildImagePrompt(item);
    const response = await request(`${GEMINI_API_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { imageConfig: { aspectRatio: '16:9' } },
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

    return writeArticleImageSetFromBytes(
      item,
      Buffer.from(inlinePart.inlineData.data, 'base64'),
      {
        provider: 'legacy-gemini',
        model,
        prompt,
        alt: item.imageAlt || articleImageAltText(item),
        generatedAt: new Date().toISOString(),
        status: 'generated',
        error: '',
      },
      { publicDir: options.publicDir, mimeType: inlinePart.inlineData.mimeType || 'image/png' },
    );
  };

  return {
    name: 'legacy-gemini',
    model,
    async generate(item) {
      return (await generateSet(item)).heroImage;
    },
    async generateWithMetadata(item) {
      return generateSet(item);
    },
  };
}
