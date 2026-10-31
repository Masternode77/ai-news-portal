import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTACT_EMAIL, POLICY_PAGES, policyPage } from "../src/lib/policy-pages.ts";

test("the eight legacy policy pages exist with content, and related links point at existing pages", () => {
  assert.deepEqual(POLICY_PAGES.map((p) => p.slug).sort(), ["about", "advertising-policy", "ai-disclosure", "contact", "editorial-policy", "methodology", "privacy", "terms"]);
  for (const page of POLICY_PAGES) {
    assert.ok(page.title && page.description && page.lede, page.slug);
    assert.ok(page.sections.length >= 3 && page.sections.every((s) => s.heading && s.paragraphs.length > 0), page.slug);
    for (const slug of page.related) assert.ok(policyPage(slug), `${page.slug} → ${slug}`);
    for (const p of page.sections.flatMap((s) => s.paragraphs)) assert.ok(!/[{}]|SITE\./.test(p), `no template residue in ${page.slug}`);
  }
  assert.equal(policyPage("radar"), null);
  assert.ok(policyPage("contact")!.sections[0]!.paragraphs.join(" ").includes(`mailto:${CONTACT_EMAIL}`));
});

test("privacy matches the rebuilt site: no analytics or advertising tags, no cookies", () => {
  const text = policyPage("privacy")!.sections.flatMap((s) => s.paragraphs).join(" ");
  assert.match(text, /loads no analytics or advertising tags/);
  assert.match(text, /sets no cookies/);
  assert.doesNotMatch(text, /Analytics choices/);
});
