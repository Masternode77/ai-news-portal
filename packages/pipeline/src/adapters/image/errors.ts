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

export function errorCodeOf(error: unknown): string {
  if (error instanceof ImageError) return error.code;
  if (error instanceof Error) {
    const match = error.message.match(/^([A-Z][A-Z0-9_]{2,})\b/);
    return match?.[1] ?? error.name;
  }
  return "UNKNOWN";
}
