/**
 * The only way adapters reach the network. Carries the legacy safety rules
 * (scripts/lib/public-network-fetcher.mjs, public-network-address.mjs):
 * https on port 443 without credentials, DNS must resolve to public
 * addresses only (SSRF), at most 3 same-host redirects, a content-type
 * allowlist and a body cap. All traffic goes through `ctx.fetch`, which
 * `--replay` replaces with a throwing function.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Logger } from "@cc/shared";
import { hostAllowed, normalizeHost } from "../../lib/url.ts";

export class SourceFetchError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, detail: string, status?: number) {
    super(`${code}: ${detail}`);
    this.name = "SourceFetchError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Public address check (IANA allocations as of 2025-10-10; unlisted IPv6 fails closed)
// ---------------------------------------------------------------------------
const PRIVATE_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const PUBLIC_IPV6: ReadonlyArray<readonly [string, number]> = [
  ["2001:200::", 23], ["2001:400::", 23], ["2001:600::", 23], ["2001:800::", 22], ["2001:c00::", 23], ["2001:e00::", 23],
  ["2001:1200::", 23], ["2001:1400::", 22], ["2001:1800::", 23], ["2001:1a00::", 23], ["2001:1c00::", 22], ["2001:2000::", 19],
  ["2001:4000::", 23], ["2001:4200::", 23], ["2001:4400::", 23], ["2001:4600::", 23], ["2001:4800::", 23], ["2001:4a00::", 23],
  ["2001:4c00::", 23], ["2001:5000::", 20], ["2001:8000::", 19], ["2001:a000::", 20], ["2001:b000::", 20], ["2003::", 18],
  ["2400::", 12], ["2410::", 12], ["2600::", 12], ["2610::", 23], ["2620::", 23], ["2630::", 12], ["2800::", 12],
  ["2a00::", 12], ["2a10::", 12], ["2c00::", 12],
];
const SPECIAL_IPV6: ReadonlyArray<readonly [string, number]> = [["2001:db8::", 32], ["2620:4f:8000::", 48]];

function ipv4Number(address: string): number | null {
  const octets = address.split(".");
  if (octets.length !== 4 || octets.some((o) => !/^\d{1,3}$/.test(o) || Number(o) > 255)) return null;
  return octets.reduce((total, o) => ((total << 8) | Number(o)) >>> 0, 0);
}

function ipv4In(address: string, base: string, prefix: number): boolean {
  const value = ipv4Number(address);
  const start = ipv4Number(base);
  if (value === null || start === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (start & mask);
}

function ipv6Words(address: string): number[] | null {
  let input = normalizeHost(address);
  if (!input || input.includes("%")) return null;
  const dotted = input.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) {
    const value = ipv4Number(dotted);
    if (value === null) return null;
    input = `${input.slice(0, -dotted.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (halves.length === 2 && fill < 1) return null;
  const words = [...left, ...Array<string>(fill).fill("0"), ...right];
  if (words.length !== 8 || words.some((w) => !/^[0-9a-f]{1,4}$/i.test(w))) return null;
  return words.map((w) => Number.parseInt(w, 16));
}

function ipv6In(words: number[], base: string, prefix: number): boolean {
  const baseWords = ipv6Words(base);
  if (!baseWords) return false;
  const whole = Math.floor(prefix / 16);
  for (let i = 0; i < whole; i += 1) if (words[i] !== baseWords[i]) return false;
  const remaining = prefix % 16;
  if (!remaining) return true;
  const mask = (0xffff << (16 - remaining)) & 0xffff;
  return ((words[whole] ?? 0) & mask) === ((baseWords[whole] ?? 0) & mask);
}

export function isPublicAddress(address: string): boolean {
  const normalized = normalizeHost(address);
  const family = isIP(normalized);
  if (family === 4) return !PRIVATE_IPV4.some(([base, prefix]) => ipv4In(normalized, base, prefix));
  if (family === 6) {
    const words = ipv6Words(normalized);
    if (!words) return false;
    if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) return false; // IPv4-mapped
    if (SPECIAL_IPV6.some(([base, prefix]) => ipv6In(words, base, prefix))) return false;
    return PUBLIC_IPV6.some(([base, prefix]) => ipv6In(words, base, prefix));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Safe fetch
// ---------------------------------------------------------------------------
export type HostResolver = (hostname: string) => Promise<string[]>;

export const defaultResolver: HostResolver = async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address);

export const FEED_CONTENT_TYPES = ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml", "application/rdf+xml", "text/html", "application/xhtml+xml", "text/plain", "application/octet-stream"] as const;
export const PAGE_CONTENT_TYPES = ["text/html", "application/xhtml+xml"] as const;
export const JSON_CONTENT_TYPES = ["application/json"] as const;

export interface SafeFetchOptions {
  fetch: typeof globalThis.fetch;
  logger?: Logger;
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  accept?: string;
  /** Exact hosts or `*.suffix`; redirects must stay inside this set. */
  allowedHosts: readonly string[];
  contentTypes: readonly string[];
  maxRedirects?: number;
  resolveHost?: HostResolver;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  text: string;
  bytes: number;
  redirects: number;
}

function parseTarget(value: string, allowedHosts: readonly string[]): URL {
  let target: URL;
  try {
    target = new URL(value.trim());
  } catch {
    throw new SourceFetchError("UNSAFE_URL", "malformed_url");
  }
  if (target.protocol !== "https:") throw new SourceFetchError("UNSAFE_URL", "https_required");
  if (target.username || target.password) throw new SourceFetchError("UNSAFE_URL", "credentials_not_allowed");
  if (target.port && target.port !== "443") throw new SourceFetchError("UNSAFE_URL", "nonstandard_port");
  if (!hostAllowed(target.hostname, allowedHosts)) throw new SourceFetchError("HOST_NOT_ALLOWED", target.hostname);
  return target;
}

async function assertPublicHost(target: URL, resolveHost: HostResolver): Promise<void> {
  const hostname = normalizeHost(target.hostname);
  const addresses = isIP(hostname) ? [hostname] : await resolveHost(hostname).catch(() => []);
  if (addresses.length === 0) throw new SourceFetchError("SOURCE_UNREACHABLE", `dns_resolution_empty ${hostname}`);
  if (addresses.some((address) => !isPublicAddress(address))) throw new SourceFetchError("UNSAFE_URL", `non_public_address ${hostname}`);
}

async function readBody(response: Response, maxBytes: number): Promise<{ text: string; bytes: number }> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new SourceFetchError("BODY_TOO_LARGE", `content-length ${declared} > ${maxBytes}`);
  if (!response.body) return { text: await response.text(), bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SourceFetchError("BODY_TOO_LARGE", `body exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8").decode(merged), bytes };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** GET a public https resource as text with the safety rules above. Throws SourceFetchError. */
export async function safeFetchText(url: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  const resolveHost = options.resolveHost ?? defaultResolver;
  let current = url;
  for (let redirects = 0; ; redirects += 1) {
    const target = parseTarget(current, options.allowedHosts);
    await assertPublicHost(target, resolveHost);
    let response: Response;
    try {
      response = await options.fetch(target.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: { "user-agent": options.userAgent, accept: options.accept ?? "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5" },
      });
    } catch (error) {
      if (error instanceof SourceFetchError) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new SourceFetchError("SOURCE_UNREACHABLE", isTimeout(error) ? `timeout after ${options.timeoutMs} ms` : detail);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new SourceFetchError("SOURCE_UNREACHABLE", `redirect ${response.status} without location`, response.status);
      if (redirects >= maxRedirects) throw new SourceFetchError("SOURCE_UNREACHABLE", `more than ${maxRedirects} redirects`, response.status);
      current = new URL(location, target.href).href;
      continue;
    }
    if (response.status >= 500 || response.status === 429) throw new SourceFetchError("SOURCE_UNREACHABLE", `http ${response.status}`, response.status);
    if (response.status >= 400) throw new SourceFetchError(`HTTP_${response.status}`, `http ${response.status} for ${target.href}`, response.status);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (contentType && !options.contentTypes.includes(contentType)) throw new SourceFetchError("BAD_CONTENT_TYPE", contentType, response.status);
    const { text, bytes } = await readBody(response, options.maxBytes);
    return { url: target.href, status: response.status, contentType, text, bytes, redirects };
  }
}
