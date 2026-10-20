/**
 * URL hygiene shared by ingest (canonical_url for the raw_items upsert) and
 * 3b normalize (`urlIdentityKey` for "the same page under another spelling").
 * Rules carried over from the legacy pipeline (scripts/lib/normalize.mjs:9-39,
 * fetch-feeds.mjs:68-87, 113-123, 393-404 liveCopyKey).
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
const GENERIC_SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go", "re", "mil"]);

/**
 * Heuristic registrable domain: the last two labels, or three under a two-letter
 * TLD with a generic second level (`co.uk`, `co.kr`, `go.kr`). Feeds commonly
 * redirect between `feeds.`, `rss.`, `www.` and the bare domain of one publisher.
 */
export function registrableDomain(hostname: string): string {
  const labels = normalizeHost(hostname).split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1]!;
  const second = labels[labels.length - 2]!;
  const take = tld.length === 2 && GENERIC_SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join(".");
}

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

/** Parameters that never change which page a URL names (beyond TRACKING_PARAMS, which ingest already strips). */
const IDENTITY_IGNORED_PARAMS = new Set<string>([
  ...TRACKING_PARAMS,
  "dclid", "msclkid", "twclid", "igshid", "mkt_tok", "_hsenc", "_hsmi", "oly_enc_id", "oly_anon_id", "cmpid", "ncid", "ocid",
  "sr_share", "guccounter", "guce_referrer", "guce_referrer_sig", "yclid", "_ga", "_gl", "amp",
]);

/**
 * Identity of the page a URL names, for dedupe (Phase 3b): host without a
 * `www.`/`m.`/`amp.` prefix, path without `index.html`, an AMP suffix or a
 * trailing slash, query without tracking parameters and in sorted order, and
 * no fragment except the dated Google release-note anchor. The canonical_url
 * itself keeps the fetchable spelling; only this key collapses the variants.
 * Returns null for anything that is not an http(s) URL.
 */
export function urlIdentityKey(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = normalizeHost(url.hostname).replace(/^(?:www|m|amp|mobile)\./, "");
  const path = url.pathname
    .replace(/\/{2,}/g, "/")
    .replace(/\/index\.html?$/i, "/")
    .replace(/\/amp\/?$/i, "/")
    .replace(/\/+$/, "");
  const params: [string, string][] = [];
  for (const [key, val] of url.searchParams) {
    const name = key.toLowerCase();
    if (name.startsWith("utm_") || IDENTITY_IGNORED_PARAMS.has(name)) continue;
    if ((name === "output" || name === "outputtype") && val.toLowerCase() === "amp") continue;
    params.push([name, val]);
  }
  params.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const query = new URLSearchParams(params).toString();
  const hash = googleReleaseNoteTarget(url.href) ? url.hash : "";
  return `${host}${path}${query ? `?${query}` : ""}${hash}`;
}
