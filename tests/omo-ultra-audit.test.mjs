import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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

test('Given the generated current-state audit When reading the checked-in report Then they are byte-identical', async () => {
  const audit = await buildOmoUltraAudit();
  const checkedInAudit = await fs.readFile(new URL('../docs/omo-ultra-audit.md', import.meta.url), 'utf8');

  assert.equal(checkedInAudit, audit.markdown);
});
