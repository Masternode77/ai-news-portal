/** Image adapter failures (Phase 3f). `code` is what the chain records per attempt and what dead letters carry. */
export class ImageError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(code: string, message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(`${code}: ${message}`);
    this.name = "ImageError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

/**
 * A provider that cannot run in this environment (3e 2026-11-18: `OPENAI_API_KEY` missing while only the essay
 * chain names openai). Every call fails with `code`, so the chain falls back to the placeholder and IMAGE_MISSING
 * (soft) records why — an image never blocks the briefs of a run.
 */
export function createUnavailableImageAdapter(provider: string, code: string, message: string): { provider: string; generate(): Promise<never> } {
  return {
    provider,
    async generate(): Promise<never> {
      throw new ImageError(code, message);
    },
  };
}

export function errorCodeOf(error: unknown): string {
  if (error instanceof ImageError) return error.code;
  if (error instanceof Error) {
    const match = error.message.match(/^([A-Z][A-Z0-9_]{2,})\b/);
    return match?.[1] ?? error.name;
  }
  return "UNKNOWN";
}
