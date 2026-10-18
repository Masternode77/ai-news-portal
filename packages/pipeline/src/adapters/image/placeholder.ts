/** Placeholder image adapter: never fails, never costs, always flags `placeholder: true` (ADR-004 IMAGE_MISSING soft rule). */
import type { ImageAdapter, ImageRequest, ImageResult, StageContext } from "@cc/shared";

export const PLACEHOLDER_IMAGE_PATH = "/images/placeholder-brief.svg";

export function createPlaceholderImageAdapter(): ImageAdapter {
  return {
    provider: "placeholder",
    async generate(request: ImageRequest, ctx: StageContext): Promise<ImageResult> {
      return {
        path: PLACEHOLDER_IMAGE_PATH,
        alt: request.alt || "Compute Current placeholder artwork",
        provenance: { provider: "placeholder", prompt: request.prompt, generatedAt: ctx.now.toISOString() },
        placeholder: true,
        costUsd: 0,
      };
    },
  };
}
