/**
 * Fixture RSS adapter (R7). Reads `fixtures/rss/<source-id>.xml` when present,
 * otherwise `fixtures/rss/<fixtureName>.xml`, and never touches the network.
 * The parser is deliberately tiny (no dependency): RSS 2.0 items only. Like the
 * live adapter it keeps the feed body (`content:encoded`) as `body_preview` for
 * sources whose rights allow it, so replay runs carry the text the generator and
 * the QA gates measure (3g SOURCE_UNREACHABLE counts source chars).
 *
 * Phase 3e: `fixtures/html/<source-id>.json` (`{ "<item link>": "<extracted text>" }`), when present, stands
 * in for live body extraction on a `text_rights: full` source: the item carries `body_text` and
 * `extraction: { ok: true, method: "fixture" }` exactly as the live ingest stage writes them, so a replay
 * can exercise what only extracted text unlocks (tier full, the essay's `essay.min_source_chars`).
 */
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { IngestConfig, RawItemInsert, SourceAdapter, SourceConfig, StageContext } from "@cc/shared";
import { cleanText, truncate } from "../../lib/html.ts";

export interface ParsedRssItem {
  title: string;
  link: string;
  guid: string | null;
  pubDate: string | null;
  description: string | null;
  /** `content:encoded` as HTML (CDATA unwrapped), null when the item has none. */
  contentHtml: string | null;
}

const ENTITY_MAP: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlText(value: string): string {
  const unwrapped = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return unwrapped
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITY_MAP[name] ?? "")
    .trim();
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match && match[1] !== undefined ? decodeXmlText(match[1]) : null;
}

export function parseRssItems(xml: string): ParsedRssItem[] {
  const items: ParsedRssItem[] = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = match[1] ?? "";
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (!title || !link) continue;
    items.push({ title, link, guid: tag(block, "guid"), pubDate: tag(block, "pubDate"), description: tag(block, "description"), contentHtml: tag(block, "content:encoded") });
  }
  return items;
}

export function toIsoDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Feed body text under the source's rights: none for link_only, the description for abstract-scoped sources (3a feedText). */
export function fixtureBodyPreview(source: SourceConfig, item: ParsedRssItem, ingest: IngestConfig): { body_preview: string } | Record<never, never> {
  if (!item.contentHtml || source.text_rights === "link_only" || source.text_scope === "abstract") return {};
  const text = cleanText(item.contentHtml);
  return text ? { body_preview: truncate(text, ingest.body_preview_chars) } : {};
}

export interface FixtureRssOptions {
  fixturesDir: string;
  fixtureName: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Recorded extractions of one source (`fixtures/html/<source-id>.json`), keyed by item link; empty when the file does not exist. */
export async function fixtureExtractions(fixturesDir: string, sourceId: string): Promise<Record<string, string>> {
  const path = join(fixturesDir, "html", `${sourceId}.json`);
  if (!(await exists(path))) return {};
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`FIXTURE_INVALID: ${path} must map item links to extracted text`);
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function createFixtureRssAdapter(options: FixtureRssOptions): SourceAdapter {
  return {
    type: "rss",
    async fetch(source: SourceConfig, ctx: StageContext): Promise<RawItemInsert[]> {
      const perSource = join(options.fixturesDir, "rss", `${source.id}.xml`);
      const path = (await exists(perSource)) ? perSource : join(options.fixturesDir, "rss", `${options.fixtureName}.xml`);
      let xml: string;
      try {
        xml = await readFile(path, "utf8");
      } catch (error) {
        throw new Error(`FIXTURE_MISSING: ${path} (${error instanceof Error ? error.message : String(error)})`);
      }
      const fetchedAt = ctx.now.toISOString();
      const extracted = source.text_rights === "full" ? await fixtureExtractions(options.fixturesDir, source.id) : {};
      return parseRssItems(xml).map((item) => {
        const text = extracted[item.link];
        return {
          source_id: source.id,
          canonical_url: item.link,
          title: item.title,
          published_at_source: toIsoDate(item.pubDate),
          fetched_at: fetchedAt,
          payload: {
            guid: item.guid,
            description: item.description,
            ...fixtureBodyPreview(source, item, ctx.config.ingest),
            ...(text ? { body_text: text, extraction: { ok: true, method: "fixture", chars: text.length } } : {}),
            fixture: path,
          },
        };
      });
    },
  };
}
