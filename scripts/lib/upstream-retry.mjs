// EIA's API and website intermittently stall, answer 5xx, or serve a
// short-lived challenge page. With a single attempt per request those blips
// failed the scheduled refresh even though the next run succeeded, so each
// upstream read gets a small, bounded number of attempts. Only transient
// conditions are retried; a definitive answer (another 4xx, an untrusted
// redirect, a malformed or oversized body, a parse failure) still fails on
// the first attempt so the refresh stays fail-closed.
export const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class UpstreamError extends Error {
  constructor(message, { status, transient = false } = {}) {
    super(message);
    this.name = 'UpstreamError';
    if (Number.isInteger(status)) this.status = status;
    this.transient = transient;
  }
}

// Builds the error for a non-OK response and releases its unread body so the
// connection is not held open while the next attempt waits.
export async function statusError(response, message) {
  await response.body?.cancel().catch(() => {});
  return new UpstreamError(message, { status: response.status, transient: TRANSIENT_STATUSES.has(response.status) });
}

// undici reports DNS, reset and TLS failures as TypeError('fetch failed') and
// a connection dropped mid-body as TypeError('terminated').
function isNetworkError(error) {
  return error instanceof TypeError && /^(fetch failed|terminated)$/i.test(error.message);
}

export function isTransientError(error) {
  if (typeof error?.transient === 'boolean') return error.transient;
  return error?.name === 'TimeoutError' || isNetworkError(error);
}

export async function withRetry(operation, { attempts = 3, delaysMs = [5000, 15000], sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= attempts || !isTransientError(error)) {
        if (attempt > 1 && error && typeof error === 'object') error.attempts = attempt;
        throw error;
      }
      await sleep(delaysMs[Math.min(attempt - 1, delaysMs.length - 1)]);
    }
  }
}

// Public diagnostic for a failed dataset. It may name an allowlisted message,
// the HTTP status and the attempt count, but never an upstream response body,
// request URL or child-process output.
export function diagnose(error, knownMessages) {
  let base;
  if (knownMessages.has(error?.message)) base = error.message;
  else if (error?.name === 'TimeoutError') base = 'Upstream request timed out';
  else if (isNetworkError(error)) base = 'Upstream connection failed';
  else if (error?.code) base = `operation failed (${String(error.code).replace(/[^A-Z0-9_]/gi, '')})`;
  else base = `operation failed (${error?.name || 'Error'})`;
  const status = Number.isInteger(error?.status) ? ` (HTTP ${error.status})` : '';
  const attempts = error?.attempts > 1 ? ` after ${error.attempts} attempts` : '';
  return `${base}${status}${attempts}`;
}
