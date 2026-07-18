import {
  CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN,
  CHATGPT_IMAGE_OAUTH_ENDPOINT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
} from '../constants.mjs';
import { articleImageAltText } from '../article-image-prompt.mjs';
import { writeArticleImageSetFromBytes } from '../image-store.mjs';
import { buildImagePrompt, fetchImageBytes, fetchWithTimeout } from './shared.mjs';

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

export function runtimeImageRequestHeaders(endpoint, imageUrl, accessToken) {
  try {
    if (!isSecureChatGptRuntimeEndpoint(endpoint) || !isSecureChatGptRuntimeEndpoint(imageUrl)) {
      return {};
    }
    if (new URL(endpoint).origin !== new URL(imageUrl).origin) return {};
  } catch {
    return {};
  }
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export function isSecureChatGptRuntimeEndpoint(value) {
  try {
    const endpoint = new URL(value);
    return (
      endpoint.protocol === 'https:' &&
      Boolean(endpoint.hostname) &&
      !endpoint.username &&
      !endpoint.password
    );
  } catch {
    return false;
  }
}

export function createChatGptOauthRuntimeProvider(options = {}) {
  const endpoint = options.endpoint ?? CHATGPT_IMAGE_OAUTH_ENDPOINT;
  const accessToken = options.accessToken ?? CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN;
  if (
    !isSecureChatGptRuntimeEndpoint(endpoint) ||
    !accessToken
  ) {
    return null;
  }

  const request = options.request || fetchWithTimeout;
  const model = 'chatgpt-runtime';
  const generateSet = async (item) => {
    const prompt = buildImagePrompt(item);
    const response = await request(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
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
    let bytes;
    let mimeType = image.mimeType;
    if (image.base64) {
      bytes = Buffer.from(image.base64, 'base64');
    } else if (image.url) {
      const fetched = await fetchImageBytes(
        image.url,
        runtimeImageRequestHeaders(endpoint, image.url, accessToken),
      );
      bytes = fetched.bytes;
      mimeType = fetched.mimeType;
    } else {
      throw new Error('No image bytes returned by ChatGPT image runtime');
    }

    return writeArticleImageSetFromBytes(item, bytes, {
      provider: 'chatgpt',
      model,
      prompt,
      alt: item.imageAlt || articleImageAltText(item),
      generatedAt: new Date().toISOString(),
      status: 'generated',
      error: '',
    }, { publicDir: options.publicDir, mimeType });
  };

  return {
    name: 'chatgpt',
    model,
    async generate(item) {
      return (await generateSet(item)).heroImage;
    },
    async generateWithMetadata(item) {
      return generateSet(item);
    },
  };
}
