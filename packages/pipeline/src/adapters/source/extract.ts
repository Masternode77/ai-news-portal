/**
 * Body extraction strategies for `text_rights: full` sources. Pure functions
 * over fetched HTML/JSON; the network part lives in the adapters. Limits and
 * special cases are the legacy rules (scripts/lib/source-fetch.mjs,
 * google-cloud-release-notes.mjs, epoch-ai.mjs) rewritten against the
 * ExtractConfig contract.
 */
import type { ExtractKind } from "@cc/shared";
import { cleanText, hasHref, pageCarriesMarker, paragraphs, removeNonContentBlocks, stripTags, truncateAtSentence, collapseWhitespace, decodeEntities } from "../../lib/html.ts";
import { googleReleaseNoteTarget } from "../../lib/url.ts";

export const MAX_EXTRACTED_PARAGRAPHS = 80;
export const MAX_EXTRACTED_CHARS = 24_000;
export const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/";

export interface Extraction {
  text: string;
  chars: number;
  paragraphs: number;
  method: string;
  limitExceeded: boolean;
  /** null when the strategy has no licence check of its own. */
  licenseOk: boolean | null;
}

export class ExtractionError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ExtractionError";
    this.code = code;
  }
}

function fromSection(sectionHtml: string, method: string, licenseOk: boolean | null): Extraction {
  const all = paragraphs(sectionHtml);
  const limitByCount = all.length > MAX_EXTRACTED_PARAGRAPHS;
  const selected = all.slice(0, MAX_EXTRACTED_PARAGRAPHS);
  const joined = selected.length > 0 ? selected.join(" ") : cleanText(sectionHtml);
  const limitByChars = joined.length > MAX_EXTRACTED_CHARS;
  const text = truncateAtSentence(joined, MAX_EXTRACTED_CHARS);
  return { text, chars: text.length, paragraphs: selected.length, method: selected.length > 0 ? method : `${method}:fallback_text`, limitExceeded: limitByCount || limitByChars, licenseOk };
}

/** `<article>`, then `<main>`, then the whole page with non-content blocks removed. */
export function extractGeneric(html: string): Extraction {
  const cleaned = removeNonContentBlocks(html);
  const article = cleaned.match(/<article(?:\s[^>]*)?>([\s\S]{0,45000})<\/article>/i)?.[1];
  if (article) return fromSection(article, "generic:article", null);
  const main = cleaned.match(/<main(?:\s[^>]*)?>([\s\S]{0,45000})<\/main>/i)?.[1];
  if (main) return fromSection(main, "generic:main", null);
  return fromSection(cleaned, "generic:page", null);
}

/** The dated section of a Google Cloud release-notes page; never the whole archive, never without the CC BY 4.0 link. */
export function extractGoogleReleaseNotes(html: string, url: string): Extraction {
  const target = googleReleaseNoteTarget(url);
  if (!target) throw new ExtractionError("EXTRACTION_FAILED", "not a dated Google Cloud release-notes url");
  if (!hasHref(html, CC_BY_4_URL)) throw new ExtractionError("LICENSE_MARKER_MISSING", "page carries no CC BY 4.0 link");
  const start = new RegExp(`<h2\\b[^>]*\\bid=["']${target.anchor}["'][^>]*>[\\s\\S]*?<\\/h2>`, "i").exec(html);
  if (!start) throw new ExtractionError("EXTRACTION_FAILED", `anchor ${target.anchor} not found`);
  const rest = html.slice(start.index + start[0].length);
  const end = rest.search(/<h2\b|<footer\b|<\/article>/i);
  const section = end >= 0 ? rest.slice(0, end) : "";
  if (!section.trim()) throw new ExtractionError("EXTRACTION_FAILED", "empty release-notes section");
  const extraction = fromSection(section, "google_release_notes", true);
  if (extraction.paragraphs === 0) {
    // Release notes are often lists; take the visible text of the section.
    const text = truncateAtSentence(cleanText(section), MAX_EXTRACTED_CHARS);
    return { ...extraction, text, chars: text.length, method: "google_release_notes:section_text" };
  }
  return extraction;
}

const EPOCH_BODY_START = /<div[^>]+class=["'][^"']*\bformatted-text content-body article-content\b[^"']*["'][^>]*>/i;
const EPOCH_BODY_END = /<div[^>]+class=["'][^"']*\bcontent-sidebar-right\b/i;

/** Epoch AI article body between its content markers; only from a page that carries the CC BY 4.0 link. */
export function extractEpoch(html: string): Extraction {
  if (!hasHref(html, CC_BY_4_URL)) throw new ExtractionError("LICENSE_MARKER_MISSING", "page carries no CC BY 4.0 link");
  const start = html.search(EPOCH_BODY_START);
  if (start < 0) throw new ExtractionError("EXTRACTION_FAILED", "article-content marker not found");
  const rest = html.slice(start);
  const end = rest.search(EPOCH_BODY_END);
  const section = end > 0 ? rest.slice(0, end) : rest.slice(0, 60_000);
  return fromSection(section, "epoch_index", true);
}

/** arXiv abstract page: the abstract blockquote only (metadata is CC0; the e-print is not). */
export function extractArxivAbstract(html: string): Extraction {
  const block = html.match(/<blockquote[^>]+class=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]*?)<\/blockquote>/i)?.[1];
  if (!block) throw new ExtractionError("EXTRACTION_FAILED", "abstract blockquote not found");
  const text = truncateAtSentence(collapseWhitespace(decodeEntities(stripTags(block))).replace(/^\s*Abstract:\s*/i, ""), MAX_EXTRACTED_CHARS);
  return { text, chars: text.length, paragraphs: 1, method: "arxiv_abstract", limitExceeded: false, licenseOk: null };
}

const EC_PRESSCORNER_DETAIL = /^https:\/\/ec\.europa\.eu\/commission\/presscorner\/detail\/([a-z]{2})\/([a-z]+)_(\d+)_(\d+)\/?(?:[?#].*)?$/i;

/** Press-corner detail pages are an Angular shell; the text lives behind the documents API keyed by TYPE/YY/NNNN. */
export function ecPressApiUrl(url: string): string | null {
  const match = url.match(EC_PRESSCORNER_DETAIL);
  if (!match) return null;
  const [, language, type, year, number] = match;
  const reference = `${type!.toUpperCase()}/${year}/${number}`;
  return `https://ec.europa.eu/commission/presscorner/api/documents?reference=${encodeURIComponent(reference)}&language=${language!.toLowerCase()}`;
}

export function extractEcPress(jsonText: string): Extraction {
  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    throw new ExtractionError("EXTRACTION_FAILED", "press-corner API returned invalid JSON");
  }
  const resource = (payload as { docuLanguageResource?: { htmlContent?: unknown; title?: unknown } } | null)?.docuLanguageResource;
  const body = typeof resource?.htmlContent === "string" ? resource.htmlContent.trim() : "";
  if (!body) throw new ExtractionError("EXTRACTION_FAILED", "press-corner document has no htmlContent");
  return fromSection(body, "ec_press", null);
}

export interface ExtractRequest {
  kind: ExtractKind;
  url: string;
  body: string;
  licenseMarker?: string | undefined;
}

/** Dispatch by kind, then apply the source's visible-text licence marker when configured. */
export function runExtraction(request: ExtractRequest): Extraction {
  let extraction: Extraction;
  switch (request.kind) {
    case "google_release_notes":
      extraction = extractGoogleReleaseNotes(request.body, request.url);
      break;
    case "epoch_index":
      extraction = extractEpoch(request.body);
      break;
    case "arxiv_abstract":
      extraction = extractArxivAbstract(request.body);
      break;
    case "ec_press":
      extraction = extractEcPress(request.body);
      break;
    case "none":
      throw new ExtractionError("EXTRACTION_FAILED", "extract.kind is none");
    default:
      extraction = extractGeneric(request.body);
  }
  if (request.licenseMarker) {
    if (!pageCarriesMarker(request.body, request.licenseMarker)) throw new ExtractionError("LICENSE_MARKER_MISSING", `page does not carry "${request.licenseMarker}"`);
    extraction = { ...extraction, licenseOk: true };
  }
  if (extraction.chars === 0) throw new ExtractionError("EXTRACTION_FAILED", "no text extracted");
  return extraction;
}
