import { test } from "node:test";
import assert from "node:assert/strict";
import { bodySections, formatDate, splitParagraphs } from "../src/lib/render.ts";

test("bodySections orders known fields and skips empty or non-string values", () => {
  const sections = bodySections({
    expert_lens_ko: "렌즈 한 문장.",
    deck: "덱",
    summary_ko: "첫 문단.\n\n둘째 문단.",
    why_it_matters_ko: "   ",
    article_text: 42,
    unknown_field: "ignored",
  });
  assert.deepEqual(
    sections.map((s) => [s.key, s.heading, s.paragraphs.length]),
    [
      ["deck", null, 1],
      ["summary_ko", "요약", 2],
      ["expert_lens_ko", "Expert Lens", 1],
    ],
  );
});

test("splitParagraphs and formatDate", () => {
  assert.deepEqual(splitParagraphs("a\r\n\r\nb\n c \n\n\n"), ["a", "b", "c"]);
  assert.equal(formatDate("2026-10-18T00:45:00.000Z"), "2026-10-18");
});
