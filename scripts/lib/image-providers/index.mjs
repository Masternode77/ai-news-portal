import { IMAGE_PROVIDER } from '../constants.mjs';
import { createChatGptOauthRuntimeProvider } from './chatgpt-oauth-runtime.mjs';
import { createGeminiImageProvider } from './gemini.mjs';
import { createOpenAiImageApiProvider } from './openai-image-api.mjs';

export function createImageProvider(providerName = IMAGE_PROVIDER) {
  switch (providerName) {
    case 'chatgpt':
      return createChatGptOauthRuntimeProvider();
    case 'openai-api':
      return createOpenAiImageApiProvider();
    case 'legacy-gemini':
      return createGeminiImageProvider();
    case 'local':
      return null;
    default:
      console.warn(`[pipeline] unsupported IMAGE_PROVIDER="${providerName}", using local image fallback`);
      return null;
  }
}

export function describeImageProvider(providerName = IMAGE_PROVIDER) {
  const provider = createImageProvider(providerName);
  return {
    requested: providerName,
    active: provider?.name || 'local',
    configured: Boolean(provider),
  };
}
