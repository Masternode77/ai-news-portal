import { IMAGE_PROVIDER } from '../constants.mjs';
import { createCodexImageProvider } from '../codex-image-provider.mjs';

export function createImageProvider(providerName = IMAGE_PROVIDER) {
  if (providerName === 'codex' || providerName === 'image2') return createCodexImageProvider();
  if (providerName !== 'local') console.warn(`[pipeline] IMAGE_PROVIDER=${providerName} is disabled; using local artwork`);
  return null;
}
export function describeImageProvider(providerName = IMAGE_PROVIDER) {
  const provider = createImageProvider(providerName);
  return { requested: providerName, active: provider?.name || 'local', configured: Boolean(provider) };
}
