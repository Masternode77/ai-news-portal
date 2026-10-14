import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHtmlEntities, detectRelatedStoryContamination } from '../scripts/lib/related-story-contamination.mjs';
import { detectTruncationArtifacts, isTruncatedEvidence, sentenceCompletionScore } from '../scripts/lib/truncation-detector.mjs';
import { analyzeSourceExtractionFailClosed } from '../scripts/lib/source-extraction-fail-closed.mjs';
import { readerCopyResult } from '../scripts/lib/reader-copy-guard.mjs';
import { authoredColumnQualityResult } from '../scripts/lib/authored-column-policy.mjs';

const prose = 'The utility signed an interconnection agreement covering the campus and identified the substation upgrade as the key constraint. Transformer delivery dates determine when customers can energize their contracted capacity. The regulator approved a large load tariff allocating upgrade costs to the developer. ';
const title = 'Utility capacity delivery outlook';
const surround = quote => `${prose.repeat(5)} The operator said, ${quote} ${prose.repeat(5)}`;

for (const ellipsis of ['…', '...', '&hellip;', '&#8230;', '&#x2026;']) {
  for (const [open, close] of [['“', '”'], ['"', '"'], ['&ldquo;', '&rdquo;'], ['&quot;', '&quot;']]) {
    test(`accepts attributed short elisions ${ellipsis} / ${open}`, () => {
      const text = surround(`${open}Capacity was tight${ellipsis} procurement lagged${ellipsis} delivery slipped${ellipsis}${close}`);
      const before = text.replace(/\s+/gu, ' ').trim();
      assert.equal(detectRelatedStoryContamination({ title, text }).detected, false);
      assert.equal(detectTruncationArtifacts(text).ok, true);
      const qa = analyzeSourceExtractionFailClosed({ title, articleText: text });
      assert.equal(qa.can_publish_local_article, true);
      assert.equal(qa.can_generate_longform, true);
      assert.equal(qa.cleaned_source_text, before);
    });
  }
}

test('entity normalization is equivalent and remains single-pass', () => {
  assert.equal(decodeHtmlEntities('&ldquo;Capacity&hellip; delivery&#8230; final&#x2026;&rdquo;'), '“Capacity… delivery… final…”');
  assert.equal(decodeHtmlEntities('&amp;hellip;'), '&hellip;');
});

for (const quote of [
  '“Capacity was tight&hellip; procurement lagged&hellip; delivery slipped&hellip;',
  '“Capacity was clo&hellip; procurement lagged&hellip; delivery slipped&hellip;”',
  '“Transformer Delivery Dates Slip&hellip; Capacity Contracts Remain Exposed&hellip; Utility Tariffs Face Challenges&hellip;”',
  '“Capacity was tight&hellip;” “Procurement was late&hellip;” “Delivery dates slipped&hellip;”',
]) {
  test(`rejects malformed or teaser quotation ${quote}`, () => {
    const text = surround(quote);
    assert.equal(detectTruncationArtifacts(text).ok, false);
    assert.equal(analyzeSourceExtractionFailClosed({ title, articleText: text }).can_generate_longform, false);
  });
}

test('unattributed or quote-only fragments remain fail-closed', () => {
  const quote = '“Capacity was tight&hellip; procurement lagged&hellip; delivery slipped&hellip;”';
  for (const text of [quote, `${prose.repeat(5)} ${quote} ${prose.repeat(5)}`]) {
    assert.equal(detectRelatedStoryContamination({ title, text }).detected, true);
    assert.equal(detectTruncationArtifacts(text).ok, false);
  }
});

test('a legitimate quote cannot conceal trailing sidebar contamination', () => {
  const quote = '“Capacity was tight&hellip; procurement lagged&hellip; delivery slipped&hellip;”';
  const sidebar = 'Transmission companies reported additional equipment delays&hellip; Storage developers postponed their interconnection studies&hellip; Cloud operators revised their campus energization schedules&hellip;';
  const text = `${surround(quote)} ${sidebar}`;
  assert.equal(detectRelatedStoryContamination({ title, text }).detected, true);
  assert.equal(analyzeSourceExtractionFailClosed({ title, articleText: text }).can_generate_longform, false);
});

for (const leak of ['return strict JSON', 'evidence.source_text', 'the supplied extract']) {
  test(`elision analysis does not bypass reader/prompt guard: ${leak}`, () => {
    const body = surround(`“Capacity was tight&hellip; procurement lagged&hellip; delivery slipped&hellip;”`) + ` ${leak}.`;
    assert.equal(readerCopyResult({ body }).ok, false);
    const result = authoredColumnQualityResult({ body, title, deck: 'An attributed report on the equipment delivery constraints affecting campus capacity.' });
    assert.ok(result.reasons.some(reason => reason.startsWith('reader_copy:')));
  });
}

test('composed truncation APIs decode nested entities only once', () => {
  const text = `${prose.repeat(5)} The literal reference is &amp;#99;.`;
  assert.equal(detectTruncationArtifacts(text).ok, true);
  assert.equal(isTruncatedEvidence(text), false);
  assert.equal(sentenceCompletionScore(text), 1);
  assert.equal(detectTruncationArtifacts(text.replace('&amp;#99;', '&#99;')).ok, false);
});
