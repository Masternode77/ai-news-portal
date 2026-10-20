import { test } from "node:test";
import assert from "node:assert/strict";
import { HostPacer } from "../src/adapters/index.ts";

test("HostPacer spaces request starts per registrable host across concurrent callers and leaves other hosts alone", async () => {
  const pacer = new HostPacer();
  const starts: { host: string; at: number }[] = [];
  const request = async (host: string, delayMs: number): Promise<void> => {
    await pacer.acquire(host, delayMs);
    starts.push({ host, at: Date.now() });
  };
  const began = Date.now();
  await Promise.all([
    request("rss.arxiv.org", 60),
    request("arxiv.org", 60),
    request("www.arxiv.org", 60),
    request("epoch.ai", 60),
    request("epoch.ai", 60),
    request("other.example", 0),
  ]);
  const arxiv = starts.filter((s) => s.host.endsWith("arxiv.org")).map((s) => s.at);
  const epoch = starts.filter((s) => s.host === "epoch.ai").map((s) => s.at);
  assert.equal(arxiv.length, 3, "rss./www./bare arxiv.org share one queue");
  // Timing assertions keep 20 ms of slack under the configured delay: the stamps are taken by the callers, so a
  // loaded runner can only make the gaps larger, never the pacer's own spacing smaller.
  assert.ok(arxiv[1]! - arxiv[0]! >= 40 && arxiv[2]! - arxiv[1]! >= 40, `arxiv starts spaced: ${arxiv.map((t) => t - began).join(",")}`);
  assert.ok(epoch[1]! - epoch[0]! >= 40, "the two epoch callers are spaced");
  const other = starts.find((s) => s.host === "other.example")!.at;
  assert.ok(epoch[0]! < arxiv[1]! && other < arxiv[1]!, "hosts are paced independently: the first epoch and other.example requests start before the second arxiv one");
  // The interval after a request is the larger of that request's delay and the next caller's: a later caller
  // with a larger delay waits for its own interval, and a caller with a smaller delay still honours the previous
  // request's (two sources on one host with different extract.delay_ms never shorten the stricter spacing).
  const t0 = Date.now();
  await pacer.acquire("slow.example", 0);
  await pacer.acquire("slow.example", 60);
  assert.ok(Date.now() - t0 >= 40, "the caller's own delay");
  const t1 = Date.now();
  await pacer.acquire("slow.example", 0);
  assert.ok(Date.now() - t1 >= 40, "the previous request's delay still applies to a caller with a smaller one");
});
