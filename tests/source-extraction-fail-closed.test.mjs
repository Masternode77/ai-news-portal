import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceExtractionPassesLongformGate, sourceExtractionPassesPublicGate } from '../scripts/lib/source-extraction-fail-closed.mjs';

test('blocks boilerplate-only extracted source text', () => {
  const article = {
    articleText: 'Want more Data Center Knowledge stories? Sign up for newsletter. Copyright © 2026 TechTarget, Inc. Registered in England and Wales.',
  };
  const publicGate = sourceExtractionPassesPublicGate(article);
  assert.equal(publicGate.ok, false);
  assert.ok(publicGate.block_reasons.includes('copyright_footer_detected'));
});

test('allows local card but blocks longform when clean source evidence is short', () => {
  const clean = `${'NetApp and Red Hat described OpenShift backup, recovery, and storage operations for enterprise AI platform teams. '.repeat(7)}End users should validate restore timing.`;
  const publicGate = sourceExtractionPassesPublicGate({ articleText: clean });
  const longformGate = sourceExtractionPassesLongformGate({ articleText: clean });
  assert.equal(publicGate.ok, true);
  assert.equal(longformGate.ok, false);
});

test('creates a hash-verified exact extraction artifact before editorial generation', () => {
  const cleaned = `${'Utility records document transformer delivery and interconnection milestones for the campus. '.repeat(20)}Final source sentence complete.`;
  const result = sourceExtractionPassesLongformGate({
    sourceUrl: 'https://example.com/utility-record',
    articleText: cleaned,
  });

  assert.equal(result.ok, true);
  assert.equal(result.extraction_artifact.source_url, 'https://example.com/utility-record');
  assert.equal(result.extraction_artifact.cleaned_extracted_text, result.cleaned_source_text);
  assert.match(result.extraction_artifact.extracted_text_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.extraction_artifact.extraction_qa.can_generate_longform, true);
});
