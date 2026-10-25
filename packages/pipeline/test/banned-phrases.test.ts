import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TEMPLATE_UNRESOLVED, parsePromptFile, renderTemplate, templatePlaceholders } from "@cc/shared";
import { bannedPhraseCheck, bannedPhrasePromptText, compileBannedPhrases, phraseRegex } from "../src/checks/banned-phrases.ts";
import { REPO_ROOT, testBannedPhrases } from "./helpers.ts";

const CLEAN = {
  title_ko: "Microsoft, 부산 AI 데이터센터 캠퍼스에 1.2 GW 용량 계약 체결",
  summary_ko: "Microsoft가 Example Data Centers와 부산의 AI 데이터센터 캠퍼스에 대해 1.2 GW 규모의 용량 계약을 맺었다고 두 회사가 월요일 밝혔다.",
  why_it_matters_ko: "국내에서 단일 하이퍼스케일러가 GW 단위 용량을 한 캠퍼스에 묶는 계약은 드물다.",
  expert_lens_ko: "1.2 GW 계약과 200 MW 1단계 사이의 간극이 핵심이다. 다음에 확인할 신호는 한전의 계통 접속 승인 시점이다.",
};

test("the inventory compiles from config/banned-phrases.yaml: Korean phrases, the legacy English list, hook starts and nine named patterns", () => {
  const config = testBannedPhrases();
  const compiled = compileBannedPhrases(config);
  assert.equal(config.phrases.ko.length, 5);
  assert.equal(config.phrases.en.length, 43, "legacy config/bannedPhrases.yml banned_phrases carried over as data");
  assert.equal(config.hook_starts.en.length, 11, "legacy blockedHookStarts");
  assert.deepEqual(config.patterns.map((p) => p.name), ["memo_scaffolding", "reads_as", "unsourced_attribution", "exclamation", "emoji", "english_heads", "prompt_leak_ko", "prompt_leak_en", "generation_field"]);
  assert.equal(compiled.phrases.length, 48);
  assert.equal(compiled.version, config.version);
});

test("phrases match case-insensitively with flexible whitespace; a clean brief passes with no matches", () => {
  assert.ok(phraseRegex("strategic significance").test("The STRATEGIC   significance is"));
  assert.ok(!phraseRegex("strategic significance").test("strategically significant"));
  const result = bannedPhraseCheck(CLEAN, compileBannedPhrases(testBannedPhrases()));
  assert.deepEqual(result, { version: testBannedPhrases().version, matches: [], pass: true });
});

test("every kind of entry is reported once with its kind: phrase, hook start and pattern", () => {
  const compiled = compileBannedPhrases(testBannedPhrases());
  const dirty = bannedPhraseCheck(
    {
      title_ko: "주목할 만하다: 게임 체인저가 왔다!",
      summary_ko: "The development puts cloud infrastructure execution first. 업계에 따르면 수요가 늘었다. 이는 호재로 읽힌다. 주목할 만하다.",
      why_it_matters_ko: "투자자 관점에서는 좋다. 운영자 관점에서는 나쁘다.",
      expert_lens_ko: "Why: 전력 🚀\nWatch: 계통",
    },
    compiled,
  );
  assert.equal(dirty.pass, false);
  assert.deepEqual(
    dirty.matches,
    [
      "phrase:주목할 만하다",
      "phrase:게임 체인저",
      "phrase:The development puts cloud infrastructure execution",
      "hook_start:The development",
      "pattern:memo_scaffolding",
      "pattern:reads_as",
      "pattern:unsourced_attribution",
      "pattern:exclamation",
      "pattern:emoji",
      "pattern:english_heads",
    ],
  );
  assert.ok(bannedPhraseCheck({ a: "운영자 관점에서는 A. 투자자 관점에서는 B." }, compiled).matches.includes("pattern:memo_scaffolding"), "either order");
  assert.ok(!bannedPhraseCheck({ a: "운영자 관점에서는 A." }, compiled).matches.includes("pattern:memo_scaffolding"), "one perspective alone is not the scaffold");
  assert.ok(!bannedPhraseCheck({ a: "What matters is the grid." }, compiled).matches.includes("pattern:english_heads"), "a heading needs its colon");
  assert.ok(!bannedPhraseCheck({ a: "© 2026 — 1.2 GW" }, compiled).matches.includes("pattern:emoji"), "text-presentation symbols are not emoji");
});

test("the prompt line is rendered from the inventory: Korean phrases quoted, pattern notes appended, English guard-only entries left out", async () => {
  const config = testBannedPhrases();
  const line = bannedPhrasePromptText(config);
  for (const phrase of config.phrases.ko) assert.ok(line.includes(`"${phrase}"`), phrase);
  for (const pattern of config.patterns) assert.ok(line.includes(pattern.note), pattern.name);
  assert.ok(!line.includes("strategic significance"), "the Korean prompt does not list the English inventory");
  const prompt = parsePromptFile(await readFile(resolve(REPO_ROOT, "prompts/news_brief.md"), "utf8"), "prompts/news_brief.md");
  assert.deepEqual(templatePlaceholders(prompt.system), ["banned_phrases"], "the prompt file carries the placeholder, not a copy of the list");
  for (const phrase of config.phrases.ko) assert.ok(!prompt.system.includes(phrase), `prompt file hard-codes "${phrase}"`);
  const rendered = renderTemplate(prompt.system, { banned_phrases: line });
  assert.ok(rendered.includes('"전략적 의미"') && !rendered.includes("{{"), rendered.slice(0, 80));
});

test("renderTemplate is strict: an unknown placeholder fails before the model sees braces, and values are not re-scanned", () => {
  assert.equal(renderTemplate("a {{ x }} b {{y}}", { x: "1", y: "{{x}}" }), "a 1 b {{x}}");
  assert.throws(() => renderTemplate("a {{missing}}", {}), (e: unknown) => e instanceof Error && e.message.startsWith(TEMPLATE_UNRESOLVED) && e.message.includes("{{missing}}"));
  assert.deepEqual(templatePlaceholders("{{a}} {{b}} {{a}} {{ c_1 }}"), ["a", "b", "c_1"]);
});
