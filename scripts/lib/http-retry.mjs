// EIA endpoints intermittently stall, answer 5xx, or serve an edge challenge
// page to GitHub-hosted runners. A single attempt turns each blip into a
// failed scheduled run, so every request here is retried with backoff. Each
// attempt (headers and body) runs under its own timeout, and only transient
// failures are retried: integrity failures surface on the first attempt.

// An upstream condition that is expected to clear on its own.
export class TransientUpstreamError extends Error {
  constructor(message, { status, retryAfterMs } = {}) {
    super(message);
    this.name = 'TransientUpstreamError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

export function isTransientError(error) {
  if (!error) return false;
  if (error instanceof TransientUpstreamError) return true;
  // AbortSignal.timeout() rejects with a DOMException named TimeoutError
  // (legacy code 23), both before headers and while streaming the body.
  if (error.name === 'TimeoutError') return true;
  if (NETWORK_CODES.has(error.code) || NETWORK_CODES.has(error.cause?.code)) return true;
  // undici reports connection failures as TypeError('fetch failed') and a
  // dropped body stream as TypeError('terminated').
  return error.name === 'TypeError' && /^(fetch failed|terminated)$/.test(error.message);
}

export function retryAfterMs(value, now = Date.now()) {
  if (value == null || value === '') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

// Public diagnostic for a transient failure. Never includes the request URL
// (it may carry an API key) or any upstream response body.
export function transientDiagnostic(error) {
  const attempts = error?.attempts ? ` after ${error.attempts} attempts` : '';
  if (error?.name === 'TimeoutError') return `Upstream request timed out${attempts}`;
  if (error instanceof TransientUpstreamError) return `${error.status ? `Upstream HTTP ${error.status}` : error.message}${attempts}`;
  return `Upstream network error${attempts}`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `read` consumes the response inside the attempt, so a body that stalls or
// drops mid-stream is retried like a failed request. Errors thrown by `read`
// are retried only when they are transient.
export async function fetchWithRetry(url, {
  attempts = 3,
  timeoutMs,
  baseDelayMs = 2000,
  maxDelayMs = 20000,
  read = (response) => response,
  init = {},
  fetchImpl = fetch,
  sleep = wait,
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('attempts must be a positive integer');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be positive');
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (RETRYABLE_STATUS.has(response.status)) {
        await response.body?.cancel().catch(() => {});
        throw new TransientUpstreamError(`Upstream HTTP ${response.status}`, { status: response.status, retryAfterMs: retryAfterMs(response.headers?.get?.('retry-after')) });
      }
      return await read(response);
    } catch (error) {
      if (attempt >= attempts || !isTransientError(error)) {
        if (error && typeof error === 'object') error.attempts = attempt;
        throw error;
      }
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      await sleep(Math.min(maxDelayMs, error.retryAfterMs ?? backoff));
    }
  }
}
