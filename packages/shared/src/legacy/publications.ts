/**
 * Maps the legacy git-committed JSON records (src/data/latest-news.json,
 * src/data/authored-columns.json) onto PublicationRow so the new site can
 * serve them during the strangler period (ADR-006 SITE_DATA_SOURCE=legacy_json)
 * and so the Phase 5 migration tool (packages/pipeline/tools/migrate-legacy-publications.ts,
 * Phase 3h) reuses the same mapper. Moved here from apps/site/src/lib/legacy-json.ts in 3h;
 * the site re-exports it.
 *
 * Only reader-page records are mapped (ADR-003 "레거시 매핑"): news with
 * `articlePagePublished && !archiveOnly && public_status === 'published'`,
 * columns with `public_status === 'published' && articlePagePublished`.
 *
 * The body is the editorial text the legacy pages render,
 * `expertLensFull.finalArticleBody` (src/pages/news/[id].astro:81,
 * src/pages/column/[slug].astro:31). The raw source extraction
 * (`articleText`, `cleaned_source_text`, `source_evidence_text`) is third-party
 * text and is deliberately never copied into a publication.
 */
import { createHash } from "node:crypto";
import { PublicationRow } from "../schema/tables.ts";
import type { ImageResult, PublicationRow as PublicationRowType } from "../schema/tables.ts";

type LegacyRecord = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function obj(value: unknown): LegacyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as LegacyRecord) : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Deterministic RFC 4122 v5-style id from the legacy id (sha1, version 5, RFC variant). */
export function legacyUuid(legacyId: string): string {
  const hex = createHash("sha1").update(`computecurrent:legacy:${legacyId}`).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "5";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16] ?? "0", 16) % 4] ?? "8";
  const s = chars.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

function toIso(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function legacyImage(record: LegacyRecord, generatedAt: string): ImageResult | null {
  const path = str(record["heroImage"]) ?? str(record["generatedImage"]) ?? str(record["ogImage"]);
  if (!path) return null;
  const candidate: ImageResult = {
    path,
    alt: str(record["imageAlt"]) ?? "",
    provenance: {
      provider: str(record["imageProvider"]) ?? str(record["generatedImageProvider"]) ?? "legacy",
      prompt: str(record["imagePrompt"]) ?? "",
      generatedAt: toIso(record["imageGeneratedAt"]) ?? generatedAt,
    },
    placeholder: false,
    costUsd: 0,
  };
  return candidate;
}

/** The editorial body and SEO fields the legacy pages render. */
function editorial(record: LegacyRecord): { body: string | null; headline: string | null; metaDescription: string | null } {
  const lens = obj(record["expertLensFull"]);
  return {
    body: str(lens?.["finalArticleBody"]),
    headline: str(lens?.["finalHeadline"]),
    metaDescription: str(lens?.["metaDescription"]),
  };
}

export function isLegacyNewsReaderPage(record: LegacyRecord): boolean {
  return bool(record["articlePagePublished"]) && !bool(record["archiveOnly"]) && record["public_status"] === "published";
}

export function isLegacyColumnReaderPage(record: LegacyRecord): boolean {
  return bool(record["articlePagePublished"]) && record["public_status"] === "published";
}

export function mapLegacyNews(record: LegacyRecord): PublicationRowType | null {
  const id = str(record["id"]);
  const title = str(record["title"]);
  const publishedAt = toIso(record["publishedAt"]);
  if (!id || !title || !publishedAt) return null;
  const { body, metaDescription } = editorial(record);
  const sourceUrl = str(record["sourceUrl"]) ?? str(record["url"]);
  const candidate = {
    id: legacyUuid(`news:${id}`),
    draft_id: null,
    slug: `news/${id}`,
    content_type: "legacy_analysis",
    title,
    body: {
      deck: str(record["deck"]),
      article_body: body,
      meta_description: metaDescription,
      why_it_matters: str(record["why_it_matters"]),
      legacy: { generation_version: record["generation_version"] ?? null, public_content_tier: record["public_content_tier"] ?? null },
    },
    image: legacyImage(record, publishedAt),
    sources: sourceUrl && /^https?:\/\//.test(sourceUrl) ? [{ url: sourceUrl, name: str(record["source"]) ?? "source", published_at: publishedAt }] : [],
    published_at: publishedAt,
    updated_at: toIso(record["updatedAt"]) ?? publishedAt,
    publisher: "legacy",
    status: "published",
    legacy_id: id,
    noindex: bool(record["noindex"]) || bool(record["seo_noindex"]),
    tags: strings(record["tags"]),
    category: str(record["primary_category"]) ?? str(record["category"]),
    region: str(record["region"]),
  };
  const parsed = PublicationRow.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function mapLegacyColumn(record: LegacyRecord): PublicationRowType | null {
  const id = str(record["id"]);
  const slug = str(record["slug"]);
  const publishedAt = toIso(record["publishedAt"]);
  const { body, headline, metaDescription } = editorial(record);
  const title = str(record["title"]) ?? headline;
  if (!id || !slug || !publishedAt || !title) return null;
  const stance = obj(record["stance"]);
  const sources = Array.isArray(record["sources"])
    ? (record["sources"] as unknown[])
        .map((s) => obj(s) ?? {})
        .map((s) => ({ url: str(s["url"]) ?? "", name: str(s["name"]) ?? str(s["source"]) ?? "source", published_at: toIso(s["publishedAt"]) }))
        .filter((s) => /^https?:\/\//.test(s.url))
    : [];
  const candidate = {
    id: legacyUuid(`column:${id}`),
    draft_id: null,
    slug: `column/${slug}`,
    content_type: "insight_essay",
    title,
    body: {
      deck: str(record["deck"]),
      thesis: str(stance?.["thesis"]),
      article_body: body,
      meta_description: metaDescription,
      legacy: { generation_version: record["generation_version"] ?? null, author: record["author"] ?? null, angle: str(stance?.["angle"]) },
    },
    image: legacyImage(record, publishedAt),
    sources,
    published_at: publishedAt,
    updated_at: toIso(record["updatedAt"]) ?? publishedAt,
    publisher: "legacy",
    status: "published",
    legacy_id: id,
    noindex: bool(record["noindex"]) || bool(record["seo_noindex"]),
    tags: strings(record["tags"]),
    category: str(record["primary_category"]) ?? str(record["category"]),
    region: str(record["region"]),
  };
  const parsed = PublicationRow.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export interface LegacyMapResult {
  rows: PublicationRowType[];
  skipped: number;
  /** Mapped reader pages whose editorial body was missing (rendered as deck only). */
  withoutBody: number;
}

export function mapLegacyCollections(news: unknown, columns: unknown): LegacyMapResult {
  const rows: PublicationRowType[] = [];
  let skipped = 0;
  let withoutBody = 0;
  const newsList = Array.isArray(news) ? (news as LegacyRecord[]) : [];
  const columnList = Array.isArray(columns) ? (columns as LegacyRecord[]) : [];
  const push = (row: PublicationRowType | null): void => {
    if (!row) {
      skipped += 1;
      return;
    }
    if (typeof row.body["article_body"] !== "string") withoutBody += 1;
    rows.push(row);
  };
  for (const record of newsList) if (isLegacyNewsReaderPage(record)) push(mapLegacyNews(record));
  for (const record of columnList) if (isLegacyColumnReaderPage(record)) push(mapLegacyColumn(record));
  rows.sort((a, b) => b.published_at.localeCompare(a.published_at));
  return { rows, skipped, withoutBody };
}
