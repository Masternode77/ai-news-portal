// Compatibility entry point for existing article image callers.
import { generateCodexImageSet, createCodexImageProvider } from './codex-image-provider.mjs';

export function metadataPatchFromImageSet(result = {}) {
  return {
    generatedImage: result.heroImage || '',
    heroImage: result.heroImage || '',
    thumbnailImage: result.thumbnailImage || '',
    ogImage: result.ogImage || '',
    legacyImage: result.legacyImage || '',
    imagePrompt: result.prompt || '',
    imageAlt: result.alt || '',
    generatedImageProvider: result.provider || 'local',
    generatedImageModel: result.model || '',
    imageProvider: result.provider || 'local',
    imageModel: result.model || '',
    imageStatus: result.status || '',
    imageError: result.error || '',
    imageGeneratedAt: result.generatedAt || '',
  };
}

export const generateArticleImageSet = generateCodexImageSet;
export const createImage2Provider = createCodexImageProvider;
