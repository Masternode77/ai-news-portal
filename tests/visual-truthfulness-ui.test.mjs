import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => fs.readFileSync(relativePath, 'utf8');

test('homepage and archive distinguish source-record coverage, an overdue pipeline, and paused long-form publishing', () => {
  const homepage = readSource('src/pages/index.astro');
  const archive = readSource('src/pages/archive/index.astro');

  for (const source of [homepage, archive]) {
    assert.match(source, /Source-linked (?:feed|records) current through/);
    assert.match(source, /Pipeline update overdue since/);
  }

  assert.match(homepage, /data-rights-review-state="zero-authorized-sources"/);
  assert.match(homepage, /Source-linked and long-form publication paused: 0 authorized sources/);
  assert.match(homepage, /authorizedSourceCount === 0 && feed\.items\.length === 0/);
  assert.match(archive, /Long-form publishing paused \(0 authorized\)/);
  assert.doesNotMatch(homepage, /update overdue · last successful update/i);
});

test('house promotions do not promise an unsupported publishing cadence', () => {
  const adSlot = readSource('src/components/monetize/AdSlot.astro');

  assert.doesNotMatch(adSlot, /refreshed several times a day|the moment it publishes/i);
});

test('policy prose preserves visible spaces around dates and inline links', () => {
  const privacy = readSource('src/pages/privacy.astro');
  const terms = readSource('src/pages/terms.astro');
  const advertisingPolicy = readSource('src/pages/advertising-policy.astro');

  assert.match(privacy, /Effective date: \{effectiveDate\}\./);
  assert.match(terms, /in the\{' '\}\s*<a href="\/ai-disclosure\/">AI-assisted disclosure<\/a>/);
  assert.match(terms, /email\{' '\}\s*<a href=\{`mailto:\$\{SITE\.contactEmail\}`\}>/);
  assert.match(advertisingPolicy, /contact\{' '\}\s*<a href=\{`mailto:\$\{SITE\.contactEmail\}`\}>/);
});
