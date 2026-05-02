import { IMAGE_PROVIDER_ORDER, PIPELINE_OFFLINE } from '../constants.mjs';
import { chatgptOauthRuntimeProvider } from './chatgpt-oauth-runtime.mjs';
import { geminiImageProvider } from './gemini.mjs';
import { openaiImageApiProvider } from './openai-image-api.mjs';

const PROVIDERS = new Map([
  [chatgptOauthRuntimeProvider.key, chatgptOauthRuntimeProvider],
  [openaiImageApiProvider.key, openaiImageApiProvider],
  [geminiImageProvider.key, geminiImageProvider],
]);

export function getImageProviderPlan() {
  const unknown = [];
  const skipped = [];
  const providers = [];

  for (const key of IMAGE_PROVIDER_ORDER) {
    const provider = PROVIDERS.get(key);

    if (!provider) {
      unknown.push(key);
      continue;
    }

    if (!provider.isAvailable({ offline: PIPELINE_OFFLINE })) {
      skipped.push(provider);
      continue;
    }

    providers.push(provider);
  }

  return { providers, skipped, unknown };
}
