import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBoilerplateText, detectBoilerplate } from '../scripts/lib/boilerplate-detector.mjs';

test('detects Data Center Knowledge and TechTarget footer leakage', () => {
  const result = detectBoilerplate('A useful data center paragraph. Want more Data Center Knowledge stories? Copyright © 2026 TechTarget, Inc. Registered in England and Wales.');
  assert.equal(result.copyright_footer_detected, true);
  assert.equal(result.nav_or_cta_detected, true);
  assert.ok(result.boilerplate_ratio > 0.08);
});

test('removes boilerplate tail from otherwise useful text', () => {
  const cleaned = cleanBoilerplateText('Power market evidence for large data centers. Want more Data Center Knowledge stories? Copyright © 2026 TechTarget, Inc.');
  assert.equal(cleaned.includes('Copyright'), false);
  assert.ok(cleaned.startsWith('Power market evidence'));
});
