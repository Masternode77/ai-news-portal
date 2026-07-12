function positiveInteger(value, fallback, { allowZero = false } = {}) {
  const number = Number(value);
  const minimum = allowZero ? 0 : 1;
  return Number.isSafeInteger(number) && number >= minimum ? number : fallback;
}

function sourceOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw Object.assign(new Error('source request requires a public HTTP(S) URL'), {
      code: 'unsafe_source_url',
      retryable: false,
    });
  }
  return url.origin;
}

function circuitOpenError() {
  return Object.assign(new Error('source circuit is temporarily open'), {
    code: 'source_circuit_open',
    retryable: true,
  });
}

export class SourceRequestCoordinator {
  constructor({
    retries = 2,
    baseDelayMs = 250,
    maxDelayMs = 2_000,
    minIntervalMs = 250,
    failureThreshold = 3,
    cooldownMs = 60_000,
    clock = Date.now,
    sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    onEvent = () => {},
  } = {}) {
    this.retries = positiveInteger(retries, 2, { allowZero: true });
    this.baseDelayMs = positiveInteger(baseDelayMs, 250, { allowZero: true });
    this.maxDelayMs = positiveInteger(maxDelayMs, 2_000, { allowZero: true });
    this.minIntervalMs = positiveInteger(minIntervalMs, 250, { allowZero: true });
    this.failureThreshold = positiveInteger(failureThreshold, 3);
    this.cooldownMs = positiveInteger(cooldownMs, 60_000);
    this.clock = clock;
    this.sleep = sleep;
    this.onEvent = onEvent;
    this.sources = new Map();
    this.counters = {
      attempts: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      circuitOpenRejections: 0,
      rateLimitWaits: 0,
    };
  }

  sourceState(origin) {
    if (!this.sources.has(origin)) {
      this.sources.set(origin, { consecutiveFailures: 0, openUntil: 0, nextAllowedAt: 0 });
    }
    return this.sources.get(origin);
  }

  emit(type, origin, detail = {}) {
    this.onEvent(Object.freeze({ type, source: origin, at: new Date(this.clock()).toISOString(), ...detail }));
  }

  async waitForRateLimit(state, origin) {
    const now = this.clock();
    const waitMs = Math.max(0, state.nextAllowedAt - now);
    state.nextAllowedAt = now + waitMs + this.minIntervalMs;
    if (!waitMs) return;
    this.counters.rateLimitWaits += 1;
    this.emit('source_rate_limit_wait', origin, { waitMs });
    await this.sleep(waitMs);
  }

  async execute(sourceUrl, operation) {
    if (typeof operation !== 'function') throw new TypeError('source request operation is required');
    const origin = sourceOrigin(sourceUrl);
    const state = this.sourceState(origin);
    const now = this.clock();
    if (state.openUntil > now) {
      this.counters.circuitOpenRejections += 1;
      this.emit('source_circuit_rejected', origin, { retryAfterMs: state.openUntil - now });
      throw circuitOpenError();
    }
    if (state.openUntil) {
      state.openUntil = 0;
      state.consecutiveFailures = 0;
      this.emit('source_circuit_half_open', origin);
    }

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      await this.waitForRateLimit(state, origin);
      this.counters.attempts += 1;
      try {
        const result = await operation(Object.freeze({ attempt: attempt + 1, source: origin }));
        state.consecutiveFailures = 0;
        this.counters.successes += 1;
        return result;
      } catch (error) {
        const canRetry = error?.retryable === true && attempt < this.retries;
        if (canRetry) {
          const delayMs = Math.min(this.maxDelayMs, this.baseDelayMs * (2 ** attempt));
          this.counters.retries += 1;
          this.emit('source_request_retry', origin, {
            attempt: attempt + 1,
            delayMs,
            code: error?.code || 'source_request_failed',
          });
          if (delayMs) await this.sleep(delayMs);
          continue;
        }
        state.consecutiveFailures += 1;
        this.counters.failures += 1;
        if (state.consecutiveFailures >= this.failureThreshold) {
          state.openUntil = this.clock() + this.cooldownMs;
          this.emit('source_circuit_opened', origin, { cooldownMs: this.cooldownMs });
        }
        throw error;
      }
    }
    throw new Error('unreachable source request state');
  }

  metrics() {
    return Object.freeze({ ...this.counters });
  }
}
