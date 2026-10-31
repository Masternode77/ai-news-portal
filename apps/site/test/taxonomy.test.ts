import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TAXONOMY, filterByTerm, findTerm, matchesTerm, normalizeTerm, taxonomyTerms } from "../src/lib/taxonomy.ts";

const row = (over: { title?: string; tags?: string[]; category?: string | null; region?: string | null }) => ({
  title: over.title ?? "제목",
  tags: over.tags ?? [],
  category: over.category ?? null,
  region: over.region ?? null,
});

test("normalizeTerm folds legacy labels and free tags onto slugs", () => {
  assert.equal(normalizeTerm("Power & Grid"), "power-grid");
  assert.equal(normalizeTerm(" data centers "), "data-centers");
  assert.equal(normalizeTerm("Capital & Deals"), "capital-deals");
  assert.equal(normalizeTerm("한국 전력"), "한국-전력");
});

test("legacy rows match by category/region label, news briefs by lowercase tags", () => {
  const power = findTerm("category", "power-grid")!;
  assert.ok(matchesTerm(row({ category: "Power & Grid" }), power));
  assert.ok(matchesTerm(row({ tags: ["grid"] }), power), "brief tag");
  assert.ok(!matchesTerm(row({ tags: ["cooling"] }), power));
  assert.ok(matchesTerm(row({ category: "Capital & Deals" }), findTerm("category", "capital-markets")!));
  assert.ok(matchesTerm(row({ category: "Policy & Siting" }), findTerm("category", "regulation")!));
  assert.ok(matchesTerm(row({ region: "US" }), findTerm("region", "us")!));
  assert.ok(matchesTerm(row({ tags: ["korea"] }), findTerm("region", "korea")!));
});

test("companies also match by name in the title, word-bounded for Latin script", () => {
  const meta = findTerm("company", "meta")!;
  assert.ok(matchesTerm(row({ title: "Meta, 루이지애나 캠퍼스 증설" }), meta));
  assert.ok(!matchesTerm(row({ title: "metadata 관리 비용" }), meta), "Meta must not match inside a word");
  assert.ok(matchesTerm(row({ title: "엔비디아 HBM 수요" }), findTerm("company", "nvidia")!));
  assert.ok(matchesTerm(row({ tags: ["amazon"] }), findTerm("company", "aws")!));
  const rows = [row({ title: "Equinix 서울 SL4" }), row({ title: "Digital Realty" })];
  assert.equal(filterByTerm(rows, findTerm("company", "equinix")!).length, 1);
});

test("every taxonomy URL in the preserve list has a term, and slugs are unique per kind", async () => {
  const csv = await readFile(resolve(import.meta.dirname, "../../../docs/diagnosis/05-preserve-list.csv"), "utf8");
  const preserved = csv.split(/\r?\n/).map((l) => l.split(",")[0] ?? "").filter((u) => /^\/(category|region|company)\//.test(u));
  assert.equal(preserved.length, 32);
  for (const url of preserved) {
    const [, kind, slug] = url.split("/");
    assert.ok(findTerm(kind as "category", slug!), `${url} has a term`);
  }
  assert.deepEqual([taxonomyTerms("category").length, taxonomyTerms("region").length, taxonomyTerms("company").length], [9, 7, 16]);
  assert.equal(new Set(TAXONOMY.map((t) => `${t.kind}/${t.slug}`)).size, TAXONOMY.length);
});
