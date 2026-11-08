import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { DraftInsert, QaEvidence } from "@cc/shared";
import { QA_RULES } from "../src/qa/registry.ts";
import { concreteTokens, hangulRatio, latinProperNouns, latinRatio, quotedSpans, sentences, shingles } from "../src/qa/text.ts";
import { numberParam } from "../src/qa/verdict.ts";
import { quoteWordCount } from "../src/qa/rules/QUOTE_TOO_LONG.ts";
import { testBannedPhrases } from "./helpers.ts";
import { BRIEF, BODY, KOREAN_TEXT, NOW, THIN_LENS, TITLE, candidate, draft, entry, evidence, rawItem, source } from "./qa-fixtures.ts";

async function check(rule: string, d: DraftInsert, ev: QaEvidence, params: Record<string, unknown> = {}, severity: "hard" | "soft" = "hard") {
  const impl = QA_RULES.get(rule);
  if (!impl) throw new Error(`no rule ${rule}`);
  return impl.check(d, ev, entry(rule, params, severity));
}

test("registry: every rules/*.ts file is registered under its own name and emits that name as rule and reason_code (ADR-004: rule add = one file)", async () => {
  const files = readdirSync(resolve(import.meta.dirname, "../src/qa/rules")).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, "")).sort();
  assert.deepEqual([...QA_RULES.keys()].sort(), files);
  for (const code of files) {
    const v = await check(code, draft(), evidence());
    assert.equal(v.rule, code);
    assert.equal(v.reason_code, code);
    assert.equal(v.checked_at, NOW.toISOString());
    assert.ok(v.evidence && typeof v.evidence === "object" && "params" in v.evidence, `${code} evidence carries the params it used`);
  }
});

test("a clean brief from a reachable full-text source passes every hard rule and every soft rule", async () => {
  for (const code of QA_RULES.keys()) {
    const v = await check(code, draft(), evidence());
    assert.equal(v.pass, true, `${code}: ${JSON.stringify(v.evidence)}`);
  }
});

test("SCHEMA_INVALID: a body whose brief lacks the source fields or has an unsupported content_type fails with the zod issues as evidence", async () => {
  const { source_url: _u, ...noSource } = BRIEF;
  const v = await check("SCHEMA_INVALID", draft(noSource), evidence());
  assert.equal(v.pass, false);
  assert.ok((v.evidence["issues"] as string[]).some((i) => i.startsWith("source_url")));
  const essay = { ...draft(), content_type: "insight_essay" as const };
  const w = await check("SCHEMA_INVALID", essay, evidence());
  assert.equal(w.pass, false);
  assert.ok((w.evidence["issues"] as string[]).some((i) => /insight_essay/.test(i)));
});

test("SOURCE_UNREACHABLE: missing item, a failed extraction on a full source, or too little source text fail; rewrite_only needs only the item", async () => {
  assert.equal((await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: undefined, sourceText: null }))).pass, false, "no raw item");
  const failed = rawItem({}, { extraction: { ok: false, error: "HTTP_404" } });
  const f = await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: failed }));
  assert.equal(f.pass, false);
  assert.equal(f.evidence["extraction_attempted"], true);
  const short = rawItem({}, { body_text: "short", extraction: { ok: true, method: "generic", chars: 5 } });
  const s = await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: short }));
  assert.equal(s.pass, false);
  assert.equal(s.evidence["source_chars"], 5);
  const notAttempted = rawItem({}, { body_text: undefined, extraction: undefined, description: BODY.slice(0, 520) });
  assert.equal((await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: notAttempted }))).pass, true, "never attempted but enough feed text");
  const rewrite = rawItem({}, { body_text: undefined, extraction: undefined, description: "a short feed summary" });
  assert.equal((await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: rewrite, source: source({ text_rights: "rewrite_only" }) }))).pass, true, "rewrite_only: item is enough");
  assert.equal((await check("SOURCE_UNREACHABLE", draft(), evidence({ rawItem: short }), { min_source_chars: 5 })).pass, true, "threshold comes from params");
});

test("QUOTE_TOO_LONG: a run of more than max_quote_words shared with the source or more than max_quotes quoted spans fails", async () => {
  const copied = { ...BRIEF, summary: `${BRIEF.summary} The source put it this way: Microsoft has signed a 1.2 GW capacity agreement with Example Data Centers for an AI data center campus in Busan the companies said on Monday the first 200 MW phase is scheduled to reach ready-for-service in 2028.` };
  const v = await check("QUOTE_TOO_LONG", draft(copied), evidence());
  assert.equal(v.pass, false);
  assert.ok((v.evidence["longest_shared_run"] as number) > 20);
  assert.equal((await check("QUOTE_TOO_LONG", draft(copied), evidence(), { max_quote_words: 60 })).pass, true, "threshold from params");
  const twoQuotes = { ...BRIEF, summary: `${BRIEF.summary} The company called it the "first 200 MW phase" and stressed "liquid cooling for GPU clusters" again.` };
  const q = await check("QUOTE_TOO_LONG", draft(twoQuotes), evidence());
  assert.equal(q.pass, false);
  assert.equal(q.evidence["quoted_spans"], 2);
  assert.equal(quotedSpans('a "one" and “two” and "x"').length, 2, "single characters are not quotes");
});

test("QUOTE_TOO_LONG count_min_words (Josh 2026-11-08): quoted terms of up to three words do not count toward max_quotes, a longer second quote still fails, and the shared-run cap is unchanged", async () => {
  // Production regenerate 2026-11-05 (LS Electric, news/a85cf04378827841): two slogan halves, each three words.
  const slogans = { ...BRIEF, summary: `${BRIEF.summary} He framed it as two parts: "Grids for AI," meaning power for AI loads, and "AI for Grids," meaning AI to run the network.` };
  const strict = await check("QUOTE_TOO_LONG", draft(slogans), evidence(), { max_quotes: 1 });
  assert.equal(strict.pass, false, "without the param every span counts");
  const terms = await check("QUOTE_TOO_LONG", draft(slogans), evidence(), { max_quotes: 1, count_min_words: 4 });
  assert.equal(terms.pass, true);
  assert.equal(terms.evidence["quoted_spans"], 0);
  assert.deepEqual(terms.evidence["short_quotes"], ["Grids for AI,", "AI for Grids,"]);
  // A four-word quote counts; two of them still exceed max_quotes 1.
  const twoQuotes = { ...BRIEF, summary: `${BRIEF.summary} The company called it the "first 200 MW phase" and stressed "liquid cooling for GPU clusters" again.` };
  const counted = await check("QUOTE_TOO_LONG", draft(twoQuotes), evidence(), { max_quotes: 1, count_min_words: 4 });
  assert.equal(counted.pass, false);
  assert.equal(counted.evidence["quoted_spans"], 2);
  // One real quote plus a quoted term passes.
  const mixed = { ...BRIEF, summary: `${BRIEF.summary} Analysts called the delay "indicative" and the operator said "the campus will be built in phases" as capacity is released.` };
  assert.equal((await check("QUOTE_TOO_LONG", draft(mixed), evidence(), { max_quotes: 1, count_min_words: 4 })).pass, true);
  assert.equal(quoteWordCount("Grids for AI,"), 3);
  assert.equal(quoteWordCount(" — AI — "), 1, "a dash alone is not a word");
  await assert.rejects(check("QUOTE_TOO_LONG", draft(slogans), evidence(), { count_min_words: "4" }), /QA_PARAM_INVALID/);
});

test("SIMILARITY_TOO_HIGH: pasted source passages raise the shingle overlap and the copied-sentence share above the legacy limits", async () => {
  const pasted = { ...BRIEF, summary: BODY, why_it_matters: BODY, expert_lens: BODY };
  const v = await check("SIMILARITY_TOO_HIGH", draft(pasted), evidence());
  assert.equal(v.pass, false);
  assert.ok((v.evidence["overlap"] as number) > 0.22, JSON.stringify(v.evidence));
  assert.ok((v.evidence["sentence_reuse"] as number) > 0.15);
  assert.equal((await check("SIMILARITY_TOO_HIGH", draft(pasted), evidence({ sourceText: null, rawItem: undefined }))).pass, true, "no source text → nothing to compare (SOURCE_UNREACHABLE catches the missing item)");
  assert.equal(shingles("a b c d e", 4).length, 2);
});

test("UNGROUNDED_NUMBER and UNGROUNDED_ENTITY: a number or a Latin name that is not in the source fails; all-caps acronyms and allow-listed names are not entities", async () => {
  const n = await check("UNGROUNDED_NUMBER", draft({ ...BRIEF, summary: `${BRIEF.summary} The second phase starts in 2027.` }), evidence());
  assert.equal(n.pass, false);
  assert.deepEqual(n.evidence["ungrounded"], ["2027"]);
  const e = await check("UNGROUNDED_ENTITY", draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Similar deals are under review at Nvidia and Oracle.` }), evidence());
  assert.equal(e.pass, false);
  assert.deepEqual(e.evidence["ungrounded"], ["Nvidia", "Oracle"]);
  const nvidia = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} A similar deal is under review at Nvidia.` });
  assert.equal((await check("UNGROUNDED_ENTITY", nvidia, evidence())).pass, false);
  assert.equal((await check("UNGROUNDED_ENTITY", nvidia, evidence(), { allow: ["Nvidia"] })).pass, true, "allow list");
  assert.deepEqual(latinProperNouns("RFS와 PPA는 GW 단위다. Microsoft and Example Data Centers.", 3).filter((x) => /[a-z]/.test(x)), ["Microsoft", "Example Data Centers"]);
  assert.deepEqual(latinProperNouns("계약을 맺은 Microsoft\nMicrosoft가 밝혔다", 3), ["Microsoft"], "a newline between reader fields never fuses two names (Codex PR #72 P2)");
  const fieldEdge = await check("UNGROUNDED_ENTITY", draft({ ...BRIEF, title: "A 1.2 GW campus deal in Busan is signed by Microsoft", summary: `Microsoft confirmed the deal. ${BRIEF.summary}` }), evidence());
  assert.equal(fieldEdge.pass, true, JSON.stringify(fieldEdge.evidence));
  // token_fallback (Phase 4, compare.md §3): two grounded names rebuilt in another word order ground token by token; a token the source never has does not.
  const rebuilt = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Solar near Nottinghamshire Newark and aid for Portugal Azores farms were also approved.` });
  const sourceWithPlaces = evidence({ sourceText: `${BODY} The solar park near Newark in Nottinghamshire and Portuguese aid for farmers in the Azores were also approved.` });
  const strict = await check("UNGROUNDED_ENTITY", rebuilt, sourceWithPlaces);
  assert.deepEqual(strict.evidence["ungrounded"], ["Nottinghamshire Newark", "Portugal Azores"], "default: verbatim only");
  assert.equal(strict.evidence["token_fallback"], false);
  const loose = await check("UNGROUNDED_ENTITY", rebuilt, sourceWithPlaces, { token_fallback: true });
  assert.equal(loose.pass, false, "Portugal is not in the source (only Portuguese)");
  assert.deepEqual(loose.evidence["ungrounded"], ["Portugal Azores"]);
  assert.deepEqual(loose.evidence["token_grounded"], ["Nottinghamshire Newark"]);
  await assert.rejects(check("UNGROUNDED_ENTITY", rebuilt, sourceWithPlaces, { token_fallback: "yes" }), /QA_PARAM_INVALID/);
  const substring = await check("UNGROUNDED_ENTITY", draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Talks with Arm Microsoft were also mentioned.` }), evidence({ sourceText: `${BODY} Microsoft is building a solar farm.` }), { token_fallback: true });
  assert.deepEqual(substring.evidence["ungrounded"], ["Arm Microsoft"], "a token matches whole words only: Arm is not inside farm (Codex PR #80)");
});

test("UNGROUNDED_ENTITY on English drafts (ADR-009): a sentence-initial plain word is not a name, a run never crosses a sentence end, calendar words are dates, and a Korean-language source's romanised names are recorded, not checked", async () => {
  // Every English sentence starts with a capital: with the default skip_sentence_initial these openers are not names.
  const openers = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Meanwhile operators wait. Hyperscalers keep asking for power.` });
  assert.equal((await check("UNGROUNDED_ENTITY", openers, evidence())).pass, true);
  const strict = await check("UNGROUNDED_ENTITY", openers, evidence(), { skip_sentence_initial: false });
  assert.equal(strict.pass, false, "without the option every opener is a candidate name");
  assert.ok((strict.evidence["ungrounded"] as string[]).includes("Meanwhile"));
  // A mixed-case or digit-bearing first word stays a name: "OpenAI" at a sentence start is still checked.
  assert.deepEqual(latinProperNouns("OpenAI signed. Microsoft agreed.", 3, { skipSentenceInitial: true }), ["OpenAI"]);
  assert.deepEqual(latinProperNouns("Gigawatt-scale deals are rare. Delivery starts with Example Data Centers.", 3, { skipSentenceInitial: true }), ["Example Data Centers"]);
  // A run used to fuse two names across a full stop ("Example Data Centers. Microsoft").
  assert.deepEqual(latinProperNouns("The deal was signed by Example Data Centers. Microsoft agreed later in Busan.", 3), ["Example Data Centers", "Microsoft", "Busan"]);
  assert.deepEqual(latinProperNouns("The companies said on Monday. Delivery starts in Busan.", 3, { skipSentenceInitial: true }), ["Busan"]);
  assert.deepEqual(latinProperNouns("Signed in October with Example Data Centers on a Tuesday.", 3, { skipSentenceInitial: true }), ["Example Data Centers"], "calendar words are not names");
  // Staging run 2026-11-04 (1ee13924): "A Brussels-run channel" and "AI-era capacity" were read as names.
  assert.deepEqual(latinProperNouns("A Brussels-run channel opens. Demand for AI-era capacity and AI-dense halls grows in Texas-based campuses.", 3, { skipSentenceInitial: true }), ["Brussels", "Texas"], "an article opener is dropped and a lowercase hyphen suffix is not part of the name");
  const regional = draft({ ...BRIEF, why_it_matters: `${BRIEF.why_it_matters} Investors weighing Southeast Asian platforms and AI-era capacity gain a marker.` });
  assert.equal((await check("UNGROUNDED_ENTITY", regional, evidence(), { allow: ["Southeast Asian"] })).pass, true, "region framing on the allow list; AI-era is the acronym AI, which is never checked");
  // A Korean-language source: an English brief romanises its names (Saemangeum for 새만금), which the source text cannot carry.
  const romanised = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} A second cluster in Saemangeum is also connected.` });
  const koSource = evidence({ source: source({ language: "ko" }) });
  assert.equal((await check("UNGROUNDED_ENTITY", romanised, koSource)).pass, false, "not exempt unless configured");
  const exempt = await check("UNGROUNDED_ENTITY", romanised, koSource, { unchecked_source_languages: ["ko"] });
  assert.equal(exempt.pass, true);
  assert.equal(exempt.evidence["skipped"], "source_language");
  assert.ok((exempt.evidence["names"] as string[]).includes("Saemangeum"));
  assert.equal((await check("UNGROUNDED_ENTITY", romanised, evidence(), { unchecked_source_languages: ["ko"] })).pass, false, "an English source is still checked");
});

test("UNGROUNDED_ENTITY aliases (2026-11-05): a demonym or another name of the same country grounds against any member of its group; capitals-only members match in capitals; a place of another extent still fails", async () => {
  const aliases = [["Korea", "South Korea", "Korean"], ["UK", "United Kingdom", "Britain", "Great Britain", "British"], ["US", "United States", "American"]];
  // Production regenerate 2026-11-05: the source said "South Korea", the brief said "Korean developers".
  const gumi = evidence({ sourceText: "Samsung SDS breaks ground on Gumi AI Data Center in South Korea\nWill eventually offer 120MW" });
  const korean = draft({ ...BRIEF, title: "Samsung SDS starts building a 120MW AI data center in Gumi, South Korea", summary: `Samsung SDS has broken ground in Gumi. ${"Capacity arrives in phases over several years. ".repeat(8)}`, why_it_matters: `The site shows Korean developers looking beyond the capital region. ${"Grid access decides timing. ".repeat(10)}`, expert_lens: `Phased builds follow grid connections. ${"Watch the first-phase figure. ".repeat(12)}` });
  const strict = await check("UNGROUNDED_ENTITY", korean, gumi, { token_fallback: true });
  assert.equal(strict.pass, false, "without aliases the demonym is not in the source");
  assert.deepEqual(strict.evidence["ungrounded"], ["Korean"]);
  const aliased = await check("UNGROUNDED_ENTITY", korean, gumi, { token_fallback: true, aliases });
  assert.equal(aliased.pass, true);
  assert.deepEqual(aliased.evidence["alias_grounded"], ["Korean → Korea"]);
  // UK in the source grounds Britain, British and Great Britain; England is not in the group and still fails.
  const pavilion = evidence({ sourceText: "Kraken, National Grid, Octopus Energy and SSE will sponsor the UK Pavilion at COP31." });
  const british = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Four British companies back the pavilion, and developers in Great Britain watch connection reform.` });
  assert.equal((await check("UNGROUNDED_ENTITY", british, pavilion, { token_fallback: true, aliases, allow: ["Microsoft", "Example Data Centers", "Busan", "Korean", "Korea", "KEPCO"] })).pass, true);
  const england = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} The grid serving eastern England may change.` });
  const englandVerdict = await check("UNGROUNDED_ENTITY", england, evidence(), { token_fallback: true, aliases });
  assert.equal(englandVerdict.pass, false);
  assert.deepEqual(englandVerdict.evidence["ungrounded"], ["England"]);
  // A capitals-only member matches in capitals only: the pronoun "us" never grounds "American".
  const american = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Several American buyers are watching the deal.` });
  assert.equal((await check("UNGROUNDED_ENTITY", american, evidence({ sourceText: `${BODY} The operator told us the site is ready.` }), { aliases })).pass, false);
  assert.equal((await check("UNGROUNDED_ENTITY", american, evidence({ sourceText: `${BODY} US buyers are interested.` }), { aliases })).pass, true);
  // A token of a multi-word name grounds through its group under token_fallback ("Korean Busan" style rebuilds).
  const rebuilt = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Lenders see a reference in the Busan Korean market.` });
  assert.equal((await check("UNGROUNDED_ENTITY", rebuilt, evidence({ sourceText: BODY.replace(/Korean/gu, "South Korea's") }), { token_fallback: true, aliases })).pass, true);
  await assert.rejects(check("UNGROUNDED_ENTITY", korean, gumi, { aliases: [["Korea"]] }), /QA_PARAM_INVALID/, "a group needs at least two names");
  await assert.rejects(check("UNGROUNDED_ENTITY", korean, gumi, { aliases: ["Korea", "Korean"] }), /QA_PARAM_INVALID/, "a flat list is not a group list");
});

test("UNGROUNDED_ENTITY acronym plurals (2026-11-08): GPUs and PCs are acronyms, not names; in a longer name the plural grounds by its singular; a real name beside them is still checked", async () => {
  // Production restore 2026-11-08 (Altman–Samsung, news/749481b7399ff99c) was rejected on "GPUs" and "PCs".
  const plurals = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Memory sitting in idle PCs could serve GPUs in shared AI halls.` });
  assert.equal((await check("UNGROUNDED_ENTITY", plurals, evidence(), { token_fallback: true })).pass, true);
  // "Nvidia GPUs" grounds when the source has Nvidia and GPU (singular); without Nvidia in the source it still fails.
  const named = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} Racks of Nvidia GPUs are planned for the second phase.` });
  assert.equal((await check("UNGROUNDED_ENTITY", named, evidence({ sourceText: `${BODY} Nvidia will supply the GPU clusters.` }), { token_fallback: true })).pass, true);
  const unnamed = await check("UNGROUNDED_ENTITY", named, evidence(), { token_fallback: true });
  assert.equal(unnamed.pass, false);
  assert.deepEqual(unnamed.evidence["ungrounded"], ["Nvidia GPUs"]);
  // A capitalised word ending in "s" is not an acronym plural: "Ross" and "Mrs" stay names.
  const ross = draft({ ...BRIEF, expert_lens: `${BRIEF.expert_lens} The analyst Ross expects delays.` });
  assert.deepEqual((await check("UNGROUNDED_ENTITY", ross, evidence())).evidence["ungrounded"], ["Ross"]);
});

test("LANG_MISMATCH and BANNED_PATTERN: a Korean brief fails the English gate (ADR-009), language ko keeps the old gate, and a banned phrase fails", async () => {
  const korean = { ...BRIEF, summary: KOREAN_TEXT, why_it_matters: KOREAN_TEXT, expert_lens: KOREAN_TEXT };
  const l = await check("LANG_MISMATCH", draft(korean), evidence());
  assert.equal(l.pass, false);
  assert.equal(l.evidence["language"], "en");
  assert.ok((l.evidence["ratio"] as number) < 0.5, JSON.stringify(l.evidence));
  assert.equal((await check("LANG_MISMATCH", draft(), evidence())).evidence["ratio"], 1, "the English brief is all Latin letters");
  const gloss = await check("LANG_MISMATCH", draft({ ...BRIEF, title: "KEPCO (한국전력) books 1.2 GW in Busan for Microsoft" }), evidence(), { min_ratio: 0.999 });
  assert.equal(gloss.pass, false, "a stray Hangul gloss counts against the English share");
  assert.equal((await check("LANG_MISMATCH", draft(korean), evidence(), { language: "ko", min_ratio: 0.6 })).pass, true, "language ko measures the Hangul share");
  assert.equal((await check("LANG_MISMATCH", draft(korean), evidence(), { language: "ko", min_hangul_ratio: 0.6 })).pass, true, "the Korean-era threshold name still reads");
  assert.equal((await check("LANG_MISMATCH", draft(), evidence(), { language: "ko" })).pass, false);
  await assert.rejects(check("LANG_MISMATCH", draft(), evidence(), { language: "fr" }), /params\.language must be en or ko/);
  assert.ok(hangulRatio("한글 Microsoft") > 0.1 && hangulRatio("1.2 GW") === 0 && hangulRatio("123") === 1);
  assert.ok(latinRatio("Microsoft 한글") < 0.9 && latinRatio("1.2 GW") === 1 && latinRatio("123") === 1);
  const b = await check("BANNED_PATTERN", draft({ ...BRIEF, title: "The strategic significance of the 1.2 GW Busan campus deal" }), evidence());
  assert.equal(b.pass, false);
  assert.deepEqual(b.evidence["matches"], ["phrase:strategic significance"]);
  assert.equal(b.evidence["inventory_version"], testBannedPhrases().version);
});

test("soft rules: RUBRIC_BELOW_TARGET, READABILITY_LOW, SEO_FIELDS_MISSING and THIN_EXPERT_LENS report their measures and thresholds", async () => {
  const r = await check("RUBRIC_BELOW_TARGET", draft(), evidence({ candidate: candidate(0.62) }), {}, "soft");
  assert.equal(r.pass, false);
  assert.equal(r.evidence["total"], 0.62);
  assert.equal((await check("RUBRIC_BELOW_TARGET", draft(), evidence({ candidate: undefined }), {}, "soft")).pass, true, "no candidate → nothing to judge");
  const repetitive = { ...BRIEF, summary: "This deal is large. This deal is long. This deal is new. This deal is in Busan. ".repeat(3) + BRIEF.summary };
  const rd = await check("READABILITY_LOW", draft(repetitive), evidence(), {}, "soft");
  assert.equal(rd.pass, false);
  assert.ok((rd.evidence["max_same_opening_count"] as number) > 2);
  const longSentence = { ...BRIEF, why_it_matters: `${"very ".repeat(45)}important deal.`, summary: BRIEF.summary.replace(/\. /g, " ").replace(/\n\n/g, " ") };
  assert.equal((await check("READABILITY_LOW", draft(longSentence), evidence(), { max_avg_sentence_words: 10 }, "soft")).pass, false, "average sentence length threshold from params");
  const seo = await check("SEO_FIELDS_MISSING", draft({ ...BRIEF, summary: `Short lead.\n\n${BRIEF.summary}` }), evidence(), {}, "soft");
  assert.equal(seo.pass, false);
  assert.equal(seo.evidence["description_chars"], "Short lead.".length);
  const thin = await check("THIN_EXPERT_LENS", draft({ ...BRIEF, expert_lens: THIN_LENS }), evidence(), {}, "soft");
  assert.equal(thin.pass, false);
  assert.equal(thin.evidence["concrete"], 0);
  assert.deepEqual(concreteTokens("345 kV 변전소와 2.1 billion, Microsoft"), ["345 kV", "2.1", "Microsoft"]);
  assert.deepEqual(concreteTokens("Operators wait for the 345 kV link. Lenders back Microsoft."), ["345 kV", "Microsoft"], "an English sentence's first word is not concrete");
  assert.equal(sentences("첫 문장이다. 두 번째 문장이다! 세 번째?").length, 3);
  assert.equal(sentences("First sentence. Second one! Third?").length, 3);
});

test("verdict params: a non-numeric param is a loud configuration error, not a silent default", () => {
  assert.throws(() => numberParam(entry("X", { k: "20" }), "k", 1), /QA_PARAM_INVALID/);
  assert.equal(numberParam(entry("X", {}), "k", 7), 7);
});

test("DUPLICATE_EVENT: a title whose event signature (numbers by value + Latin names) matches a recent title is rejected; calendar figures, small signatures and unrelated stories pass", async () => {
  const dup = QA_RULES.get("DUPLICATE_EVENT")!;
  const cfg = entry("DUPLICATE_EVENT", { min_shared: 3, min_jaccard: 0.5 });
  // Korean titles stay in this test: rows published before ADR-009 carry them, and the signature compares across languages.
  const withTitle = (title: string) => draft({ ...BRIEF, title });
  // compare.md §3 row 13: the run-5 DOE release and the run-8 power-eng write-up of the same loan.
  const published = "미 에너지부, Constellation 원전 출력증강에 최대 50억 달러 조건부 대출…약 1.1GW 추가";
  const second = await dup.check(withTitle("DOE, Constellation 원전 업레이트에 최대 50억 달러 조건부 대출 약정…약 1.1GW 증설"), evidence({ recentPublishedTitles: [published] }), cfg);
  assert.equal(second.pass, false);
  const match = second.evidence["duplicate_of"] as { title: string; shared: string[]; jaccard: number };
  assert.equal(match.title, published);
  assert.equal(match.shared.length, 3, JSON.stringify(match));
  assert.equal(match.jaccard, 0.75);
  // "$5 billion" in English and "50억 달러" in Korean are one value.
  assert.equal((await dup.check(withTitle("Constellation gets $5 billion DOE loan for 1.1GW of uprates"), evidence({ recentPublishedTitles: [published] }), cfg)).pass, false);
  // Another DOE loan: shares only the agency and a currency word, not the amount or the borrower.
  assert.equal((await dup.check(withTitle("미 에너지부, Alliant Energy에 51억 달러 대출 집행… 아이오와·위스콘신에 2.6GW 이상 발전 용량 추가"), evidence({ recentPublishedTitles: [published] }), cfg)).pass, true);
  // Same day, same capacity and voltage, different project: dates are not part of the signature (with them, 4 shared).
  const daySig = await dup.check(withTitle("영국, 10월 30일 Sea Link 2 GW·345 kV 해저 송전망 승인"), evidence({ recentPublishedTitles: ["영국, 10월 30일 Frodsham Solar 2 GW·345 kV 태양광 승인"] }), cfg);
  assert.equal(daySig.pass, true, JSON.stringify(daySig.evidence));
  assert.deepEqual((daySig.evidence["signature"] as string[]).sort(), ["#2", "#345", "sea link"]);
  // Whole numeric dates are calendar figures too (Codex PR #84): same company, same day, different site and size.
  const isoDay = await dup.check(withTitle("Microsoft, 2026-10-30 부산 100MW 데이터센터 착공"), evidence({ recentPublishedTitles: ["Microsoft, 2026-10-30 서울 200MW 데이터센터 착공"] }), cfg);
  assert.equal(isoDay.pass, true, JSON.stringify(isoDay.evidence));
  assert.deepEqual((isoDay.evidence["signature"] as string[]).sort(), ["#100", "microsoft"]);
  for (const date of ["2026/10/30", "10/30/2026", "30.10.2026"]) {
    const signature = (await dup.check(withTitle(`Microsoft, ${date} 부산 100MW 착공`), evidence({ recentPublishedTitles: [] }), cfg)).evidence["signature"] as string[];
    assert.deepEqual([...signature].sort(), ["#100", "microsoft"], date);
  }
  // A multi-word name is one element and a code's digits are not a figure: two COP31 stories that share National Grid are not one event.
  const cop = await dup.check(withTitle("National Grid, COP31에서 송전망 투자 계획 발표"), evidence({ recentPublishedTitles: ["Kraken·National Grid·Octopus·SSE, COP31 영국관 공식 파트너로 참여"] }), cfg);
  assert.equal(cop.pass, true, JSON.stringify(cop.evidence));
  assert.deepEqual((cop.evidence["signature"] as string[]).sort(), ["cop31", "national grid"]);
  // A title with fewer than min_shared signature elements is never a duplicate (documented limit).
  assert.equal((await dup.check(withTitle("미국 에너지부, 계통 기자재 공급망에 2억3,700만 달러 지원 공모"), evidence({ recentPublishedTitles: ["미국 에너지부, 계통 기자재 공급망에 2억3,700만 달러 지원 공모"] }), cfg)).pass, true);
  // Nothing to compare with: pass, and the evidence says so.
  const alone = await dup.check(withTitle(published), evidence({ recentPublishedTitles: [] }), cfg);
  assert.equal(alone.pass, true);
  assert.equal(alone.evidence["compared"], 0);
  await assert.rejects(async () => dup.check(withTitle(published), evidence(), entry("DUPLICATE_EVENT", { min_shared: "3" })), /QA_PARAM_INVALID: DUPLICATE_EVENT\.params\.min_shared/);
});
