/**
 * Maps the legacy git-committed JSON records (src/data/latest-news.json,
 * src/data/authored-columns.json) onto PublicationRow so the new site can
 * serve them during the strangler period (ADR-006 SITE_DATA_SOURCE=legacy_json)
 * and so the Phase 5 migration script has one mapper to reuse.
 *
 * Only reader-page records are mapped (ADR-003 "레거시 매핑"): news with
 * `articlePagePublished && !archiveOnly && public_status === 'published'`,
 * columns with `public_status === 'published' && articlePagePublished`.
 */
import { createHash } from "node:crypto";
import { PublicationRow } from "@cc/shared";
import type { ImageResult, PublicationRow as PublicationRowType } from "@cc/shared";

type LegacyRecord = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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
  return {
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
  const sourceUrl = str(record["sourceUrl"]) ?? str(record["url"]);
  const candidate = {
    id: legacyUuid(`news:${id}`),
    draft_id: null,
    slug: `news/${id}`,
    content_type: "legacy_analysis",
    title,
    body: {
      deck: str(record["deck"]),
      article_text: str(record["articleText"]),
      why_it_matters: str(record["why_it_matters"]),
      expert_lens: str(record["expertLensFull"]) ?? str(record["expertLensShort"]),
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
  const headline = str(record["headline"]) ?? str(record["title"]) ?? (record["draft"] && typeof record["draft"] === "object" ? str((record["draft"] as LegacyRecord)["headline"]) : null);
  if (!id || !slug || !publishedAt || !headline) return null;
  const sources = Array.isArray(record["sources"])
    ? (record["sources"] as unknown[])
        .map((s) => (s && typeof s === "object" ? (s as LegacyRecord) : {}))
        .map((s) => ({ url: str(s["url"]) ?? "", name: str(s["name"]) ?? str(s["source"]) ?? "source", published_at: toIso(s["publishedAt"]) }))
        .filter((s) => /^https?:\/\//.test(s.url))
    : [];
  const candidate = {
    id: legacyUuid(`column:${id}`),
    draft_id: null,
    slug: `column/${slug}`,
    content_type: "insight_essay",
    title: headline,
    body: {
      deck: str(record["deck"]),
      draft: record["draft"] && typeof record["draft"] === "object" ? record["draft"] : null,
      stance: str(record["stance"]),
      legacy: { generation_version: record["generation_version"] ?? null, author: record["author"] ?? null },
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
}

export function mapLegacyCollections(news: unknown, columns: unknown): LegacyMapResult {
  const rows: PublicationRowType[] = [];
  let skipped = 0;
  const newsList = Array.isArray(news) ? (news as LegacyRecord[]) : [];
  const columnList = Array.isArray(columns) ? (columns as LegacyRecord[]) : [];
  for (const record of newsList) {
    if (!isLegacyNewsReaderPage(record)) continue;
    const row = mapLegacyNews(record);
    if (row) rows.push(row);
    else skipped += 1;
  }
  for (const record of columnList) {
    if (!isLegacyColumnReaderPage(record)) continue;
    const row = mapLegacyColumn(record);
    if (row) rows.push(row);
    else skipped += 1;
  }
  rows.sort((a, b) => b.published_at.localeCompare(a.published_at));
  return { rows, skipped };
}
