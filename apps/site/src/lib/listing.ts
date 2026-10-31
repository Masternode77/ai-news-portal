/**
 * Listing helpers shared by the home, archive, column, author and taxonomy
 * pages. Pure and Node-testable.
 *
 * The archive keeps the legacy page size (18, src/pages/archive/[page].astro)
 * so /archive/{n}/ addresses stay meaningful; the legacy catalog filled 28
 * pages with wire items, the rebuilt one lists publications only, so a page
 * past the last one redirects to /archive/ instead of answering 404 (R8).
 */
import type { PublicationRow } from "@cc/shared";

export const ARCHIVE_PAGE_SIZE = 18;
/**
 * Rows a listing page reads: every page filters this one list, so all pages agree on what exists. The
 * Supabase repo reads it in pages of 1,000 (Codex PR #85), so the archive, taxonomy pages and the sitemap
 * see the whole catalog up to this ceiling (≈ 5 years at today's 5 publications a day).
 */
export const LISTING_LIMIT = 10000;

export interface Page<T> {
  items: T[];
  page: number;
  pages: number;
}

export function pageCount(total: number, size: number = ARCHIVE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function paginate<T>(rows: readonly T[], page: number, size: number = ARCHIVE_PAGE_SIZE): Page<T> {
  const pages = pageCount(rows.length, size);
  const start = (page - 1) * size;
  return { items: rows.slice(start, start + size), page, pages };
}

export type ArchiveRoute = { kind: "page"; page: number } | { kind: "redirect"; location: string } | { kind: "not_found" };

/**
 * /archive/{param}/: page 1 lives at /archive/; a valid page renders; a page
 * past the end (the legacy site had 28) redirects to /archive/; anything that
 * is not a positive integer is a 404.
 */
export function archiveRoute(param: string | undefined, total: number, size: number = ARCHIVE_PAGE_SIZE): ArchiveRoute {
  if (param === undefined || !/^[1-9][0-9]{0,4}$/.test(param)) return { kind: "not_found" };
  const page = Number(param);
  if (page === 1 || page > pageCount(total, size)) return { kind: "redirect", location: "/archive/" };
  return { kind: "page", page };
}

export function archivePath(page: number): string {
  return page <= 1 ? "/archive/" : `/archive/${page}/`;
}

export function publicationPath(row: Pick<PublicationRow, "slug">): string {
  return `/${row.slug}/`;
}

export function isColumn(row: Pick<PublicationRow, "slug">): boolean {
  return row.slug.startsWith("column/");
}

const CONTENT_LABEL: Record<PublicationRow["content_type"], string> = {
  news_brief: "브리프",
  insight_essay: "인사이트",
  legacy_analysis: "분석",
};

export function contentLabel(row: Pick<PublicationRow, "content_type" | "slug">): string {
  // Legacy columns are The Current whatever content type the migration gave them.
  if (isColumn(row)) return "The Current";
  return CONTENT_LABEL[row.content_type];
}

/** Indexable rows only: noindex publications stay reachable but out of feeds and the sitemap. */
export function indexableRows<T extends Pick<PublicationRow, "noindex">>(rows: readonly T[]): T[] {
  return rows.filter((row) => !row.noindex);
}
