/**
 * Taxonomy pages (/category, /region, /company) over published rows.
 *
 * The slugs and English labels are the legacy site's preserved URLs
 * (docs/diagnosis/05-preserve-list.csv, src/data/taxonomy-pages.json); the
 * Korean labels and match terms are new. A row belongs to a term when its
 * `category`, `region` or any tag normalises to one of the term's `match`
 * values, or (companies only) when its title names the company. Legacy rows
 * carry labels such as "Power & Grid"; news briefs carry lowercase tags from
 * prompts/news_brief.md (power, grid, hbm, korea …) and no category/region.
 *
 * Pure and Node-testable; no Astro imports. Changing a match list changes
 * which rows a page lists, nothing else.
 */
import type { PublicationRow } from "@cc/shared";

export type TaxonomyKind = "category" | "region" | "company";

export interface TaxonomyTerm {
  kind: TaxonomyKind;
  slug: string;
  label: string;
  labelKo: string;
  /** Normalised category/region/tag values that place a row under this term. */
  match: readonly string[];
  /** Companies only: names searched in the title (case-insensitive, word-bounded for Latin script). */
  names?: readonly string[];
}

const category = (slug: string, label: string, labelKo: string, match: string[]): TaxonomyTerm => ({ kind: "category", slug, label, labelKo, match: [slug, ...match] });
const region = (slug: string, label: string, labelKo: string, match: string[]): TaxonomyTerm => ({ kind: "region", slug, label, labelKo, match: [slug, ...match] });
const company = (slug: string, label: string, names: string[], match: string[] = []): TaxonomyTerm => ({
  kind: "company",
  slug,
  label,
  labelKo: label,
  match: [slug, ...match],
  names,
});

export const TAXONOMY: readonly TaxonomyTerm[] = [
  category("power-grid", "Power & Grid", "전력·계통", ["power", "grid", "electricity", "energy", "nuclear", "utility", "utilities", "ppa", "transmission", "ercot", "interconnection"]),
  category("data-centers", "Data Centers", "데이터센터", ["data-center", "datacenter", "datacenters", "hyperscale", "colocation", "campus"]),
  category("cloud-capacity", "Cloud Capacity", "클라우드 용량", ["cloud", "neocloud", "gpu-cloud", "capacity", "kubernetes"]),
  category("semiconductors", "Semiconductors", "반도체", ["semiconductor", "chips", "chip", "hbm", "gpu", "memory", "foundry", "ai-servers"]),
  category("cooling", "Cooling", "냉각", ["liquid-cooling", "thermal", "immersion"]),
  category("capital-markets", "Capital Markets", "자본시장", ["capital-deals", "capital", "financing", "finance", "investment", "funding", "ipo", "debt", "m-a", "deals"]),
  category("regulation", "Regulation", "규제·정책", ["policy-siting", "policy", "regulation", "permitting", "eu-policy", "government", "legislation"]),
  category("supply-chain", "Supply Chain", "공급망", ["supply-chain", "supplychain", "trade", "trade-data", "export-controls", "chip-smuggling", "logistics"]),
  category("ai-infrastructure", "AI Infrastructure", "AI 인프라", ["ai", "inference", "training", "compute", "ai-sandboxes"]),
  region("us", "US", "미국", ["usa", "united-states", "texas", "virginia", "eia", "doe"]),
  region("europe", "Europe", "유럽", ["uk", "united-kingdom", "germany", "france", "nordics", "ireland", "netherlands"]),
  region("apac", "APAC", "아시아태평양", ["asia", "asia-pacific", "japan", "malaysia", "singapore", "australia", "india", "taiwan", "china"]),
  region("middle-east", "Middle East", "중동", ["gulf", "uae", "saudi-arabia", "qatar", "hormuz"]),
  region("global", "Global", "글로벌", ["world", "worldwide"]),
  region("eu", "EU", "EU", ["european-union", "eu-policy", "brussels"]),
  region("korea", "Korea", "한국", ["south-korea", "kr"]),
  company("openai", "OpenAI", ["OpenAI", "오픈AI"]),
  company("aws", "AWS", ["AWS", "Amazon Web Services", "Amazon", "아마존"], ["amazon"]),
  company("microsoft", "Microsoft", ["Microsoft", "마이크로소프트"]),
  company("oracle", "Oracle", ["Oracle", "오라클"]),
  company("nvidia", "NVIDIA", ["NVIDIA", "Nvidia", "엔비디아"]),
  company("amd", "AMD", ["AMD"]),
  company("blackstone", "Blackstone", ["Blackstone", "블랙스톤"]),
  company("applied-digital", "Applied Digital", ["Applied Digital"]),
  company("anthropic", "Anthropic", ["Anthropic", "앤트로픽"]),
  company("coreweave", "CoreWeave", ["CoreWeave", "코어위브"]),
  company("meta", "Meta", ["Meta"]),
  company("google", "Google", ["Google", "구글", "Alphabet"], ["alphabet"]),
  company("tesla", "Tesla", ["Tesla", "테슬라"]),
  company("xai", "xAI", ["xAI"]),
  company("digital-realty", "Digital Realty", ["Digital Realty", "디지털리얼티"]),
  company("equinix", "Equinix", ["Equinix", "에퀴닉스"]),
];

/** "Power & Grid" → "power-grid", "data centers" → "data-centers"; Hangul kept. */
export function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function taxonomyTerms(kind: TaxonomyKind): TaxonomyTerm[] {
  return TAXONOMY.filter((term) => term.kind === kind);
}

export function findTerm(kind: TaxonomyKind, slug: string): TaxonomyTerm | null {
  return TAXONOMY.find((term) => term.kind === kind && term.slug === slug) ?? null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameInTitle(title: string, name: string): boolean {
  // Latin names need word boundaries ("Meta" must not match "metadata"); Hangul names are matched as substrings.
  if (/[가-힣]/.test(name)) return title.includes(name);
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(name)}($|[^A-Za-z0-9])`, "i").test(title);
}

export function matchesTerm(row: Pick<PublicationRow, "title" | "tags" | "category" | "region">, term: TaxonomyTerm): boolean {
  const values = [row.category, row.region, ...row.tags].filter((v): v is string => typeof v === "string" && v.length > 0).map(normalizeTerm);
  if (values.some((value) => term.match.includes(value))) return true;
  return (term.names ?? []).some((name) => nameInTitle(row.title, name));
}

export function filterByTerm<T extends Pick<PublicationRow, "title" | "tags" | "category" | "region">>(rows: readonly T[], term: TaxonomyTerm): T[] {
  return rows.filter((row) => matchesTerm(row, term));
}

export function termPath(term: TaxonomyTerm): string {
  return `/${term.kind}/${term.slug}/`;
}
