/**
 * Legacy JSON → PublicationRow mapping. The implementation lives in
 * `@cc/shared` (packages/shared/src/legacy/publications.ts) since Phase 3h so the
 * pipeline's migration tool and the site's `legacy_json` data source share one
 * mapper; this module keeps the site's import path stable (.astro files never
 * import `@cc/shared` directly, see CLAUDE.md §7).
 */
export { isLegacyColumnReaderPage, isLegacyNewsReaderPage, legacyUuid, mapLegacyCollections, mapLegacyColumn, mapLegacyNews } from "@cc/shared";
export type { LegacyMapResult } from "@cc/shared";
