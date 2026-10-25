/**
 * OpenAI Images adapter (Phase 3f). Opt-in (`image.provider: openai`), raw HTTP
 * through `ctx.fetch` only (so `--replay` throws, R7; no new package), key read
 * by name (`OPENAI_API_KEY`) and never logged. Cost comes from
 * `image.pricing[model].usd_per_image` because the Images API reports no usage.
 */
import type { ImageAdapter, ImageConfig, ImageMime, ImageRequest, ImageResult, StageContext } from "@cc/shared";
import { ImageError } from "./errors.ts";

export interface OpenAiImageOptions {
  apiKey: string;
  image: ImageConfig;
  /** Base backoff between retries (tests shrink it). */
  backoffMs?: number;
}

const MIME: Record<"png" | "jpeg" | "webp", ImageMime> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** What the budget guard reserves before a paid image call. */
export function imageCostEstimate(image: ImageConfig): number {
  return image.pricing[image.openai.model]?.usd_per_image ?? 0;
}

export interface OpenAiImagePayload {
  base64: string | null;
  url: string | null;
}

export function extractOpenAiImage(payload: unknown): OpenAiImagePayload {
  const first = (payload as { data?: Array<Record<string, unknown>> })?.data?.[0] ?? {};
  const base64 = typeof first["b64_json"] === "string" ? first["b64_json"] : null;
  const url = typeof first["url"] === "string" ? first["url"] : null;
  return { base64, url };
}

export function createOpenAiImageAdapter(options: OpenAiImageOptions): ImageAdapter {
  const backoff = options.backoffMs ?? 1000;
  return {
    provider: "openai",
    async generate(request: ImageRequest, ctx: StageContext): Promise<ImageResult> {
      const cfg = options.image.openai;
      const pricing = options.image.pricing[cfg.model];
      if (!pricing) throw new ImageError("IMAGE_PRICING_MISSING", `no image.pricing row for model ${cfg.model}; the budget guard needs one`);
      const url = `${cfg.base_url.replace(/\/$/, "")}/v1/images/generations`;
      const body = JSON.stringify({ model: cfg.model, prompt: request.prompt, n: 1, size: cfg.size, quality: cfg.quality, output_format: cfg.output_format });
      let lastError: ImageError | null = null;
      for (let attempt = 0; attempt <= options.image.max_retries; attempt += 1) {
        if (attempt > 0) await sleep(backoff * 2 ** (attempt - 1));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.image.timeout_ms);
        try {
          let response: Response;
          let text: string;
          try {
            response = await ctx.fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` }, body, signal: controller.signal });
            text = await response.text();
          } catch (error) {
            const aborted = error instanceof Error && error.name === "AbortError";
            lastError = new ImageError(aborted ? "IMAGE_TIMEOUT" : "IMAGE_UNAVAILABLE", aborted ? `no complete response within ${options.image.timeout_ms} ms` : error instanceof Error ? error.message : String(error), { retryable: true });
            ctx.logger.warn("image: openai request failed, will retry", { attempt, code: lastError.code, slug: request.slug });
            continue;
          }
          if (response.status === 429 || response.status >= 500) {
            lastError = new ImageError("IMAGE_UNAVAILABLE", `http ${response.status}`, { status: response.status, retryable: true });
            ctx.logger.warn("image: openai upstream unavailable, will retry", { attempt, status: response.status, slug: request.slug });
            continue;
          }
          if (!response.ok) throw new ImageError("IMAGE_REQUEST_REJECTED", `http ${response.status}: ${text.slice(0, 300)}`, { status: response.status });
          // A 2xx means the generation was billed. Record it here, before the reply is parsed, the bytes are
          // fetched or the store is written: if any of those fail the chain falls back to the placeholder, and
          // the run's cost and call caps must still see the paid call (Codex P2, PR #66).
          const costUsd = pricing.usd_per_image;
          ctx.budget.record(costUsd);
          ctx.logger.info("image: openai generation charged", { slug: request.slug, model: cfg.model, cost_usd: costUsd, attempt });
          let payload: unknown;
          try {
            payload = JSON.parse(text);
          } catch {
            throw new ImageError("IMAGE_RESPONSE_INVALID", `non-JSON response body (${text.length} chars)`);
          }
          const image = extractOpenAiImage(payload);
          let bytes: Uint8Array;
          let mime: ImageMime = MIME[cfg.output_format];
          if (image.base64) {
            bytes = Buffer.from(image.base64, "base64");
          } else if (image.url) {
            const fetched = await ctx.fetch(image.url, { signal: controller.signal });
            if (!fetched.ok) throw new ImageError("IMAGE_UNAVAILABLE", `generated image fetch failed: http ${fetched.status}`, { status: fetched.status, retryable: true });
            bytes = new Uint8Array(await fetched.arrayBuffer());
            const type = fetched.headers.get("content-type");
            if (type && type in MIME_BY_TYPE) mime = MIME_BY_TYPE[type]!;
          } else {
            throw new ImageError("IMAGE_RESPONSE_INVALID", "no image bytes in the response");
          }
          if (bytes.byteLength === 0) throw new ImageError("IMAGE_RESPONSE_INVALID", "empty image");
          const stored = await ctx.adapters.imageStore.put({ bytes, mime, slug: request.slug, variant: "hero" }, ctx);
          ctx.logger.info("image: openai generated", { slug: request.slug, model: cfg.model, bytes: stored.bytes, cost_usd: costUsd, attempt });
          return { path: stored.path, alt: request.alt, provenance: { provider: "openai", model: cfg.model, prompt: request.prompt, generatedAt: ctx.now.toISOString() }, placeholder: false, costUsd };
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError ?? new ImageError("IMAGE_UNAVAILABLE", "no attempts made");
    },
  };
}

const MIME_BY_TYPE: Record<string, ImageMime> = { "image/png": "image/png", "image/jpeg": "image/jpeg", "image/webp": "image/webp", "image/svg+xml": "image/svg+xml" };
