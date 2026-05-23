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
