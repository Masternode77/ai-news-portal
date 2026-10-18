/**
 * Dependency-free RSS 2.0 / RDF / Atom 1.0 parser for the fields ingest
 * needs. Works on the raw XML so markup-in-title feeds (ACER wraps titles in
 * anchors) and escaped-HTML descriptions are handled without an xml2js
 * detour. Unknown feeds degrade to "no items", never to a crash.
 */
import { cleanText, decodeEntities, unwrapCdata } from "../../lib/html.ts";

export interface FeedItem {
  title: string;
  link: string | null;
  guid: string | null;
  /** Raw date strings in priority order (isoDate-equivalents first). */
  dates: string[];
  /** HTML content (content:encoded → content → description/summary). */
  contentHtml: string;
  /** Short HTML/text summary (description/summary) when distinct from content. */
  summaryHtml: string;
  image: string | null;
  categories: string[];
}

export interface ParsedFeed {
  kind: "rss" | "atom" | "rdf";
  title: string;
  language: string | null;
  items: FeedItem[];
}

function tagRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i");
}

/** Inner content of the first `<name>` element: CDATA unwrapped, escaped markup decoded to HTML. */
function innerHtml(block: string, name: string): string | null {
  const match = block.match(tagRegex(name));
  if (!match || match[1] === undefined) return null;
  const { text, wasCdata } = unwrapCdata(match[1]);
  const html = wasCdata ? text : decodeEntities(text);
  return html.trim();
}

function innerText(block: string, name: string): string | null {
  const html = innerHtml(block, name);
  if (html === null) return null;
  const text = cleanText(html);
  return text.length > 0 ? text : null;
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, "i"));
  return match?.[1] ? decodeEntities(match[1]).trim() : null;
}

function firstTag(block: string, name: string, predicate: (tag: string) => boolean = () => true): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const match of block.matchAll(new RegExp(`<${escaped}(?:\\s[^>]*)?/?>`, "gi"))) {
    if (predicate(match[0])) return match[0];
  }
  return null;
}

function atomLink(block: string): string | null {
  const alternate = firstTag(block, "link", (tag) => /\srel=["']alternate["']/i.test(tag) && /\shref=/i.test(tag));
  if (alternate) return attr(alternate, "href");
  const plain = firstTag(block, "link", (tag) => /\shref=/i.test(tag) && !/\srel=["'](?:self|enclosure|related|via|replies|edit|hub)["']/i.test(tag));
  return plain ? attr(plain, "href") : null;
}

function rssLink(block: string): string | null {
  // <link> text, or an Atom-style <link href> inside an RSS item, or a permalink guid.
  const text = innerText(block, "link");
  if (text) return text;
  const hrefTag = firstTag(block, "link", (tag) => /\shref=/i.test(tag));
  if (hrefTag) return attr(hrefTag, "href");
  return null;
}

function imageOf(block: string): string | null {
  const enclosure = firstTag(block, "enclosure", (tag) => /\stype=["']image\//i.test(tag) || !/\stype=/i.test(tag));
  const enclosureUrl = enclosure ? attr(enclosure, "url") : null;
  if (enclosureUrl) return enclosureUrl;
  const media = firstTag(block, "media:content", (tag) => /\surl=/i.test(tag) && !/\smedium=["'](?:video|audio|document)["']/i.test(tag));
  const mediaUrl = media ? attr(media, "url") : null;
  if (mediaUrl) return mediaUrl;
  const thumb = firstTag(block, "media:thumbnail");
  return thumb ? attr(thumb, "url") : null;
}

function categories(block: string): string[] {
  const values: string[] = [];
  for (const match of block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)) {
    const text = cleanText(unwrapCdata(match[1] ?? "").text);
    if (text) values.push(text);
  }
  for (const match of block.matchAll(/<category\s[^>]*term=["']([^"']+)["'][^>]*\/?>/gi)) {
    const term = decodeEntities(match[1] ?? "").trim();
    if (term) values.push(term);
  }
  return [...new Set(values)].slice(0, 12);
}

function parseItemBlock(block: string, kind: ParsedFeed["kind"]): FeedItem | null {
  const title = innerText(block, "title") ?? "";
  const guid = kind === "atom" ? innerText(block, "id") : innerText(block, "guid");
  const link = kind === "atom" ? atomLink(block) : rssLink(block);
  const contentHtml = innerHtml(block, "content:encoded") ?? innerHtml(block, "content") ?? innerHtml(block, "description") ?? innerHtml(block, "summary") ?? "";
  const summaryHtml = innerHtml(block, "description") ?? innerHtml(block, "summary") ?? "";
  const dates = [
    innerText(block, "dc:date"),
    innerText(block, "pubDate"),
    innerText(block, "published"),
    innerText(block, "updated"),
    innerText(block, "issued"),
    innerText(block, "date"),
  ].filter((d): d is string => d !== null);
  if (!title && !link) return null;
  return { title, link, guid, dates, contentHtml, summaryHtml, image: imageOf(block), categories: categories(block) };
}

export function parseFeed(xml: string): ParsedFeed {
  const source = xml.replace(/^﻿/, "");
  const kind: ParsedFeed["kind"] = /<feed[\s>]/i.test(source) && /<entry[\s>]/i.test(source) ? "atom" : /<rdf:RDF[\s>]/i.test(source) ? "rdf" : "rss";
  const blocks = kind === "atom" ? [...source.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)] : [...source.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  const items: FeedItem[] = [];
  for (const match of blocks) {
    const item = parseItemBlock(match[1] ?? "", kind);
    if (item) items.push(item);
  }
  const head = kind === "atom" ? source.slice(0, source.search(/<entry[\s>]/i) >= 0 ? source.search(/<entry[\s>]/i) : undefined) : source.slice(0, source.search(/<item[\s>]/i) >= 0 ? source.search(/<item[\s>]/i) : undefined);
  const title = innerText(head, "title") ?? "";
  const language = innerText(head, "language") ?? (head.match(/xml:lang=["']([a-zA-Z-]+)["']/)?.[1] ?? null);
  return { kind, title, language: language ? language.toLowerCase().slice(0, 2) : null, items };
}
