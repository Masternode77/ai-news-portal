/**
 * Turns a publication body (legacy_analysis, news_brief or insight_essay
 * shapes) into ordered sections for the skeleton templates. Pure and
 * Node-testable; no Astro imports.
 */
/** Re-exported so .astro templates never import `@cc/shared` directly (the legacy root `astro check` cannot resolve it). */
export type { PublicationRow } from "@cc/shared";

export interface BodySection {
  key: string;
  heading: string | null;
  paragraphs: string[];
}

const KNOWN_FIELDS: { key: string; heading: string | null }[] = [
  { key: "deck", heading: null },
  { key: "thesis_ko", heading: "핵심 주장" },
  { key: "thesis", heading: "핵심 주장" },
  { key: "summary_ko", heading: "요약" },
  { key: "article_body", heading: null },
  { key: "body_ko", heading: null },
  { key: "why_it_matters_ko", heading: "왜 중요한가" },
  { key: "why_it_matters", heading: "왜 중요한가" },
  { key: "expert_lens_ko", heading: "Expert Lens" },
  { key: "expert_lens", heading: "Expert Lens" },
  { key: "counterpoint_ko", heading: "반론" },
  { key: "implications_ko", heading: "시사점" },
];

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function bodySections(body: Record<string, unknown>): BodySection[] {
  const sections: BodySection[] = [];
  for (const field of KNOWN_FIELDS) {
    const value = body[field.key];
    if (typeof value !== "string" || value.trim().length === 0) continue;
    sections.push({ key: field.key, heading: field.heading, paragraphs: splitParagraphs(value) });
  }
  return sections;
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
