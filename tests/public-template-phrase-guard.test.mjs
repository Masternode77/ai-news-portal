import test from 'node:test';
import assert from 'node:assert/strict';
import { guardPublicTemplatePhrases, hasPublicTemplatePhrase } from '../scripts/lib/public-template-phrase-guard.mjs';

test('blocks old public article template language and near variants', () => {
  assert.equal(hasPublicTemplatePhrase('The issue is no longer demand alone; it is whether the surrounding infrastructure is ready.'), true);
  assert.equal(hasPublicTemplatePhrase('The market usually prices the demand story first before capacity evidence arrives.'), true);
  const result = guardPublicTemplatePhrases('Editor’s Brief');
  assert.equal(result.ok, false);
});

test('allows source-specific editorial copy', () => {
  const result = guardPublicTemplatePhrases('NetApp’s OpenShift update turns backup and DR into a platform-readiness issue.');
  assert.equal(result.ok, true);
});
