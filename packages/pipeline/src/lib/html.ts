/**
 * Small HTML/text helpers for feeds and article pages. Regex based on
 * purpose (no parser dependency); the legacy extractor worked the same way
 * (scripts/lib/source-fetch.mjs:266-326).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  euro: "€",
  pound: "£",
  yen: "¥",
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
  return String.fromCodePoint(code);
}

export function unwrapCdata(value: string): { text: string; wasCdata: boolean } {
  const trimmed = value.trim();
  const match = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (match) return { text: match[1] ?? "", wasCdata: true };
  return { text: value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"), wasCdata: false };
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Visible text of an HTML fragment: tags removed, entities decoded, whitespace collapsed. */
export function cleanText(html: string): string {
  return collapseWhitespace(decodeEntities(stripTags(html)));
}

export function metaContent(html: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"))?.[0] ?? "";
  return cleanText(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
}

export function removeNonContentBlocks(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");
}

export const BOILERPLATE_LINE = /cookie|subscribe|advertisement/i;

/** Paragraph texts longer than `minChars`, skipping obvious boilerplate lines. */
export function paragraphs(sectionHtml: string, minChars = 60): string[] {
  // `<p` alone would also open on <pre>, <path>, <picture> and <param>.
  return [...sectionHtml.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1] ?? ""))
    .filter((text) => text.length > minChars && !BOILERPLATE_LINE.test(text));
}

/** Cut at the last sentence end before `maxChars` (when that keeps at least 500 chars), else hard-truncate with an ellipsis. */
export function truncateAtSentence(text: string, maxChars: number): string {
  const cleaned = text.trim();
  if (cleaned.length <= maxChars) return cleaned;
  const clipped = cleaned.slice(0, maxChars);
  const sentenceEnd = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  if (sentenceEnd >= 500) return clipped.slice(0, sentenceEnd + 1).trim();
  return `${clipped.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function truncate(text: string, maxChars: number): string {
  const cleaned = text.trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** The marker is matched against visible text so a linked licence name still counts and script text never does. */
export function pageCarriesMarker(html: string, marker: string): boolean {
  const wanted = collapseWhitespace(marker).toLowerCase();
  if (!wanted) return false;
  return cleanText(html).toLowerCase().includes(wanted);
}

export function firstImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

export function hasHref(html: string, href: string): boolean {
  return html.includes(`href="${href}"`) || html.includes(`href='${href}'`);
}
