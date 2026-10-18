/**
 * URL hygiene shared by ingest (canonical_url for the raw_items upsert) and,
 * later, 3b normalize. Rules carried over from the legacy pipeline
 * (scripts/lib/normalize.mjs:9-39, fetch-feeds.mjs:68-87, 113-123).
 */

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "ref", "fbclid", "gclid", "mc_cid", "mc_eid"] as const;

/** Google Cloud release-note pages: the dated `#Month_DD_YYYY` fragment is part of the item identity. */
export const GOOGLE_RELEASE_NOTE_PRODUCTS: Record<string, string> = {
  "/compute/docs/release-notes": "Google Cloud Compute Engine",
  "/gemini-enterprise-agent-platform/release-notes": "Google Cloud AI",
  "/tpu/docs/release-notes": "Google Cloud TPU",
};
const GOOGLE_ANCHOR = /^#(?:January|February|March|April|May|June|July|August|September|October|November|December)_\d{2}_\d{4}$/;

export function googleReleaseNoteTarget(value: string): { product: string; anchor: string } | null {
  try {
    const url = new URL(value);
    const product = GOOGLE_RELEASE_NOTE_PRODUCTS[url.pathname];
    if (url.protocol !== "https:" || url.hostname !== "docs.cloud.google.com" || url.port || url.username || url.password || !product) return null;
    if (!GOOGLE_ANCHOR.test(url.hash)) return null;
    return { product, anchor: url.hash.slice(1) };
  } catch {
    return null;
  }
}

export interface CleanUrlOptions {
  /** Keep `#fragment`; Google release notes keep it automatically. */
  keepFragment?: boolean;
  /** Upgrade http to https (every authorised publisher serves https). Default true. */
  upgradeHttp?: boolean;
}

/** Returns a cleaned absolute http(s) URL, or null when the value is unsafe or not a web URL. */
export function cleanItemUrl(raw: string | null | undefined, options: CleanUrlOptions = {}): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || CONTROL_CHARACTERS.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.protocol === "http:" && options.upgradeHttp !== false) url.protocol = "https:";
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  if (!(options.keepFragment || googleReleaseNoteTarget(url.href))) url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  return url.toString();
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Some Drupal feeds ship an escaped anchor where the link belongs (recover its
 * href); others ship a path relative to the feed (resolve it against the feed URL).
 */
export function repairFeedLink(raw: string, baseUrl: string): string {
  const value = raw.trim();
  if (!value) return "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const anchor = decoded.match(/<a\s[^>]*href=["']([^"']+)["']/i);
  const candidate = anchor?.[1] ?? value;
  if (HAS_SCHEME.test(candidate)) return candidate;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return candidate;
  }
}

export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export function hostOf(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

/** Exact host match, or `*.suffix` for any subdomain (never the bare suffix). */
export function hostAllowed(hostname: string, allowed: readonly string[]): boolean {
  const host = normalizeHost(hostname);
  return allowed.some((candidate) => {
    const pattern = normalizeHost(candidate);
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return host.endsWith(`.${suffix}`) && host !== suffix;
    }
    return host === pattern;
  });
}

/** A prefix-scoped source accepts one slug segment under its section path, with no query or fragment. */
export function pathWithinPrefix(url: URL, prefix: string): boolean {
  if (!prefix.startsWith("/") || !prefix.endsWith("/")) return false;
  if (url.search || url.hash) return false;
  if (!url.pathname.startsWith(prefix)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(url.pathname.slice(prefix.length));
}
