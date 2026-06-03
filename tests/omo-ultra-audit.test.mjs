import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_AUDIT_SECTIONS,
  buildOmoUltraAudit,
  validateAuditSections,
} from '../scripts/audit-omo-ultra-current-state.mjs';

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
