/**
 * Per-host request pacing shared by every live adapter (Phase 3a review):
 * two sources on one publisher (the two Epoch index pages, the three arXiv
 * feeds) must not interleave their page requests, so the minimum interval is
 * enforced per registrable domain in one place instead of per adapter call.
 * `acquire` resolves when the caller may start its request, at least
 * `delayMs` after the previous request start on that host; callers queue in
 * arrival order and the request itself runs outside the lock.
 */
import { sleep } from "../../lib/concurrency.ts";
import { normalizeHost, registrableDomain } from "../../lib/url.ts";

export class HostPacer {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly lastStart = new Map<string, number>();

  async acquire(hostname: string, delayMs: number): Promise<void> {
    const key = registrableDomain(normalizeHost(hostname));
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(key, previous.then(() => mine));
    await previous;
    try {
      const wait = (this.lastStart.get(key) ?? Number.NEGATIVE_INFINITY) + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastStart.set(key, Date.now());
    } finally {
      release();
    }
  }
}
