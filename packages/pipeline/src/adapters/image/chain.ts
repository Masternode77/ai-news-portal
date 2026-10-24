/**
 * Provider chain (Phase 3f): `image.provider` first, then `image.fallback_chain`
 * in order; the last link is always the placeholder, which does not throw, so a
 * run always leaves the stage with an image. Every attempt is recorded for the
 * IMAGE_MISSING verdict's evidence.
 */
import type { ImageAdapter, ImageConfig, ImageProvider, ImageRequest, ImageResult, StageContext } from "@cc/shared";
import { errorCodeOf } from "./errors.ts";
import { staticPlaceholder } from "./placeholder.ts";

export interface ImageAttempt {
  provider: string;
  ok: boolean;
  code: string | null;
  error: string | null;
  ms: number;
}

export interface ImageChainResult {
  image: ImageResult;
  attempts: ImageAttempt[];
}

export interface ImageChainOptions {
  /** True when the run budget cannot cover a paid call: paid providers are skipped, not tried. */
  skipPaid?: boolean;
}

export interface ImageChain extends ImageAdapter {
  readonly order: readonly ImageProvider[];
  generateDetailed(request: ImageRequest, ctx: StageContext, options?: ImageChainOptions): Promise<ImageChainResult>;
}

export const PAID_IMAGE_PROVIDERS: ReadonlySet<string> = new Set(["openai"]);

/** provider, then the fallback chain without repeats, ending with placeholder. */
export function imageChainOrder(config: ImageConfig): ImageProvider[] {
  const order: ImageProvider[] = [config.provider];
  for (const provider of config.fallback_chain) if (!order.includes(provider)) order.push(provider);
  if (order[order.length - 1] !== "placeholder") order.push("placeholder");
  return order;
}

export function createImageChain(config: ImageConfig, adapters: Partial<Record<ImageProvider, ImageAdapter>>): ImageChain {
  const order = imageChainOrder(config);
  for (const provider of order) {
    if (!adapters[provider]) throw new Error(`IMAGE_PROVIDER_MISSING: no adapter registered for image provider "${provider}"`);
  }
  async function generateDetailed(request: ImageRequest, ctx: StageContext, options: ImageChainOptions = {}): Promise<ImageChainResult> {
    const attempts: ImageAttempt[] = [];
    for (const provider of order) {
      if (options.skipPaid && PAID_IMAGE_PROVIDERS.has(provider)) {
        attempts.push({ provider, ok: false, code: "IMAGE_BUDGET_SKIPPED", error: "the run budget cannot cover another paid image", ms: 0 });
        continue;
      }
      const started = Date.now();
      try {
        const image = await adapters[provider]!.generate(request, ctx);
        attempts.push({ provider, ok: true, code: null, error: null, ms: Date.now() - started });
        return { image, attempts };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({ provider, ok: false, code: errorCodeOf(error), error: message.slice(0, 300), ms: Date.now() - started });
        ctx.logger.warn("image: provider failed, trying the next one", { provider, slug: request.slug, code: errorCodeOf(error) });
      }
    }
    // Only reachable if the placeholder adapter itself threw: fall back to the static file.
    return { image: staticPlaceholder(request, ctx), attempts };
  }
  return {
    provider: "chain",
    order,
    generateDetailed,
    async generate(request: ImageRequest, ctx: StageContext): Promise<ImageResult> {
      return (await generateDetailed(request, ctx)).image;
    },
  };
}

export function isImageChain(adapter: ImageAdapter): adapter is ImageChain {
  return typeof (adapter as ImageChain).generateDetailed === "function";
}
