import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED_CONTENT_TYPES, SourceFetchError, isPublicAddress, safeFetchText } from "../src/adapters/source/net.ts";
import type { SafeFetchOptions } from "../src/adapters/source/net.ts";

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

function options(handler: Handler, overrides: Partial<SafeFetchOptions> = {}): SafeFetchOptions {
  return {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init)) as typeof globalThis.fetch,
    timeoutMs: 1000,
    maxBytes: 1024,
    userAgent: "TestBot/1.0",
    allowedHosts: ["feeds.test", "*.feeds.test"],
    contentTypes: FEED_CONTENT_TYPES,
    resolveHost: async () => ["93.184.216.34"],
    ...overrides,
  };
}

const ok = (body: string, headers: Record<string, string> = { "content-type": "application/rss+xml" }, status = 200) => new Response(body, { status, headers });

test("isPublicAddress rejects private, loopback, link-local, CGNAT, documentation and unallocated ranges", () => {
  for (const address of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "100.64.1.1", "192.168.0.1", "172.16.5.5", "192.0.2.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fd00::1", "2001:db8::1", "::ffff:10.0.0.1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "2a00:1450:4001:80b::200e"]) assert.equal(isPublicAddress(address), true, address);
  assert.equal(isPublicAddress("not-an-ip"), false);
});

test("fetches text with the user agent and returns the final url", async () => {
  let seenUa = "";
  const result = await safeFetchText("https://feeds.test/rss", options((url, init) => {
    seenUa = String((init?.headers as Record<string, string>)["user-agent"]);
    return ok("<rss/>");
  }));
  assert.equal(result.text, "<rss/>");
  assert.equal(result.url, "https://feeds.test/rss");
  assert.equal(result.contentType, "application/rss+xml");
  assert.equal(seenUa, "TestBot/1.0");
  assert.equal(result.redirects, 0);
});

test("rejects non-https, credentials, ports, hosts outside the allowlist and private DNS answers", async () => {
  const handler: Handler = () => ok("<rss/>");
  await assert.rejects(safeFetchText("http://feeds.test/rss", options(handler)), (e: unknown) => e instanceof SourceFetchError && e.code === "UNSAFE_URL");
  await assert.rejects(safeFetchText("https://u:p@feeds.test/rss", options(handler)), /credentials/);
  await assert.rejects(safeFetchText("https://feeds.test:8443/rss", options(handler)), /nonstandard_port/);
  await assert.rejects(safeFetchText("https://evil.test/rss", options(handler)), (e: unknown) => e instanceof SourceFetchError && e.code === "HOST_NOT_ALLOWED");
  await assert.rejects(safeFetchText("https://feeds.test/rss", options(handler, { resolveHost: async () => ["10.0.0.5"] })), /non_public_address/);
  await assert.rejects(safeFetchText("https://feeds.test/rss", options(handler, { resolveHost: async () => [] })), /dns_resolution_empty/);
  await assert.rejects(safeFetchText("https://169.254.169.254/latest", options(handler, { allowedHosts: ["169.254.169.254"] })), /non_public_address/);
});

test("follows same-host redirects up to the limit and refuses cross-host ones", async () => {
  const calls: string[] = [];
  const redirecting: Handler = (url) => {
    calls.push(url);
    if (url.endsWith("/a")) return new Response(null, { status: 301, headers: { location: "/b" } });
    if (url.endsWith("/b")) return new Response(null, { status: 302, headers: { location: "https://sub.feeds.test/c" } });
    return ok("<rss/>");
  };
  const result = await safeFetchText("https://feeds.test/a", options(redirecting));
  assert.equal(result.url, "https://sub.feeds.test/c");
  assert.equal(result.redirects, 2);
  await assert.rejects(safeFetchText("https://feeds.test/a", options(() => new Response(null, { status: 302, headers: { location: "https://evil.test/x" } }))), /HOST_NOT_ALLOWED/);
  await assert.rejects(safeFetchText("https://feeds.test/loop", options(() => new Response(null, { status: 307, headers: { location: "/loop" } }))), /more than 3 redirects/);
  await assert.rejects(safeFetchText("https://feeds.test/r", options(() => new Response(null, { status: 301 }))), /without location/);
});

test("maps status codes, content types and body size to error codes", async () => {
  await assert.rejects(safeFetchText("https://feeds.test/x", options(() => ok("", {}, 503))), (e: unknown) => e instanceof SourceFetchError && e.code === "SOURCE_UNREACHABLE" && e.status === 503);
  await assert.rejects(safeFetchText("https://feeds.test/x", options(() => ok("", {}, 429))), /SOURCE_UNREACHABLE/);
  await assert.rejects(safeFetchText("https://feeds.test/x", options(() => ok("", {}, 404))), (e: unknown) => e instanceof SourceFetchError && e.code === "HTTP_404");
  await assert.rejects(safeFetchText("https://feeds.test/x", options(() => ok("x", { "content-type": "image/png" }))), /BAD_CONTENT_TYPE/);
  await assert.rejects(safeFetchText("https://feeds.test/x", options(() => ok("x".repeat(2000)))), /BODY_TOO_LARGE/);
  await assert.rejects(safeFetchText("https://feeds.test/x", options(() => ok("x", { "content-type": "text/xml", "content-length": "99999" }))), /content-length/);
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  await assert.rejects(safeFetchText("https://feeds.test/x", options(() => Promise.reject(timeout))), /timeout after 1000 ms/);
  await assert.rejects(safeFetchText("https://feeds.test/x", options(() => Promise.reject(new Error("ECONNRESET")))), (e: unknown) => e instanceof SourceFetchError && e.code === "SOURCE_UNREACHABLE");
});

test("a body that stalls or disconnects after the headers is SOURCE_UNREACHABLE, not a bare stream error", async () => {
  const stalled = (name: string, message: string): Response => {
    const error = new Error(message);
    error.name = name;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<rss>"));
        controller.error(error);
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  await assert.rejects(
    safeFetchText("https://feeds.test/x", options(() => stalled("TimeoutError", "The operation was aborted due to timeout"))),
    (e: unknown) => e instanceof SourceFetchError && e.code === "SOURCE_UNREACHABLE" && /timeout while reading body after 1000 ms/.test(e.message),
  );
  await assert.rejects(
    safeFetchText("https://feeds.test/x", options(() => stalled("TypeError", "terminated"))),
    (e: unknown) => e instanceof SourceFetchError && e.code === "SOURCE_UNREACHABLE" && /body stream failed: terminated/.test(e.message),
  );
});
