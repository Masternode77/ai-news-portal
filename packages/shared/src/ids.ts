/**
 * Deterministic identifiers. `raw_items.id` is derived from the canonical URL
 * (contracts.md §5: the raw item key is the canonical URL) so that ingest can
 * stamp the id before the idempotent upsert and an `on conflict (canonical_url)`
 * update never tries to change the primary key; normalize and score can then
 * reference the row without reading it back.
 */
import { createHash } from "node:crypto";

/** RFC 4122 v5-shaped UUID: sha1 of `namespace:name`, version nibble 5, RFC variant. */
export function deterministicUuid(namespace: string, name: string): string {
  const hex = createHash("sha1").update(`${namespace}:${name}`).digest("hex").slice(0, 32);
  const variant = ["8", "9", "a", "b"][Number.parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  const s = `${hex.slice(0, 12)}5${hex.slice(13, 16)}${variant}${hex.slice(17, 32)}`;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export const RAW_ITEM_ID_NAMESPACE = "computecurrent:raw_item";

/** The fixed derivation of `raw_items.id`; changing it would make an upsert attempt a primary-key update. */
export function rawItemId(canonicalUrl: string): string {
  return deterministicUuid(RAW_ITEM_ID_NAMESPACE, canonicalUrl);
}

export const CANDIDATE_ID_NAMESPACE = "computecurrent:candidate";
export const DRAFT_ID_NAMESPACE = "computecurrent:draft";

/** `candidates.id` from its idempotency key (contracts.md §5: raw_item_id + rubric_version); Phase 3d. */
export function candidateId(rawItemId: string, rubricVersion: string): string {
  return deterministicUuid(CANDIDATE_ID_NAMESPACE, `${rawItemId}:${rubricVersion}`);
}

/** `drafts.id` from its idempotency key (candidate_id + content_type + prompt_version); Phase 3d. */
export function draftId(candidateId: string, contentType: string, promptVersion: string): string {
  return deterministicUuid(DRAFT_ID_NAMESPACE, `${candidateId}:${contentType}:${promptVersion}`);
}

/** Legacy news slug rule kept (contracts.md §5): `news/` + sha1(canonical_url | title)[0:16]. */
export function newsBriefSlug(canonicalUrl: string, title: string): string {
  return `news/${createHash("sha1").update(`${canonicalUrl}|${title}`).digest("hex").slice(0, 16)}`;
}

export const PUBLICATION_ID_NAMESPACE = "computecurrent:publication";

/** Phase 3h: a publications row id derived from the slug, so a re-publish of the same slug keeps its id. */
export function publicationId(slug: string): string {
  return deterministicUuid(PUBLICATION_ID_NAMESPACE, slug);
}
