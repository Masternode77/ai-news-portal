import assert from 'node:assert/strict';
import test from 'node:test';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import {
  REQUIRED_AUDIT_SECTIONS,
  buildOmoUltraAudit,
  validateAuditSections,
} from '../scripts/audit-omo-ultra-current-state.mjs';
import { publicHomepageFeedEligible } from '../scripts/lib/homepage-feed-builder.mjs';

test('fails when required audit sections are missing', () => {
  const result = validateAuditSections('# OMO Ultra Current State Audit\n\n## Framework and Routing System\n');

  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('Homepage Renderer'));
  assert.ok(result.missing.includes('Safe Admin Implementation Location'));
});

test('Given the current repository When building the OMO Ultra audit Then every required section is present', async () => {
  const audit = await buildOmoUltraAudit();

  const validation = validateAuditSections(audit.markdown);
  assert.equal(validation.ok, true, `missing sections: ${validation.missing.join(', ')}`);
  for (const section of REQUIRED_AUDIT_SECTIONS) {
    assert.match(audit.markdown, new RegExp(`^## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
});

test('Given the current repository When building the OMO Ultra audit Then explicit failure causes are answered', async () => {
  const audit = await buildOmoUltraAudit();

  assert.match(audit.markdown, /Why old Editor's Brief templates are still live/i);
  assert.match(audit.markdown, /Why banned phrases still appear/i);
  assert.match(audit.markdown, /Why low-relevance items still appear in the homepage feed/i);
  assert.match(audit.markdown, /Why images are not reliably visible per article/i);
  assert.match(audit.markdown, /Whether generated article pages are stale and need regeneration/i);
  assert.match(audit.markdown, /Where admin should be implemented safely/i);
  assert.match(audit.markdown, /Dirty Worktree Warning/i);
});

test('Given the current admin implementation When building the audit Then it reports the modern security contract', async () => {
  const audit = await buildOmoUltraAudit();

  assert.match(audit.markdown, /adminEdit=true, dashboard=true/);
  assert.match(audit.markdown, /Argon2id password verification/);
  assert.match(audit.markdown, /CSRF validation/);
  assert.match(audit.markdown, /Postgres in production/);
  assert.doesNotMatch(audit.markdown, /plaintext-style envs/);
  assert.doesNotMatch(audit.markdown, /Requested secure envs not fully implemented/);
  assert.doesNotMatch(audit.markdown, /password comparison must be replaced/);
  assert.doesNotMatch(audit.markdown, /article editor seed/);
});

test('Given the current public corpus When auditing homepage eligibility Then metrics match the canonical feed predicate', async () => {
  const audit = await buildOmoUltraAudit();
  const canonicalEligible = [...latestNews, ...archivedNews].filter(publicHomepageFeedEligible);

  assert.equal(audit.metrics.homepageEligibleCount, canonicalEligible.length);
  assert.match(audit.markdown, new RegExp(`Homepage-eligible records found in JSON: ${canonicalEligible.length}\\.`));
});
