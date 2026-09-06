import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateFinalReport } from '../scripts/lib/final-report-contract.mjs';

const FINAL_REPORTS = [
  'docs/omo-ultra-implementation-report.md',
  'docs/modern-design-report.md',
  'docs/humanized-blog-engine-report.md',
  'docs/image-generation-report.md',
  'docs/admin-cms-report.md',
  'docs/legacy-migration-report.md',
  'docs/public-qa-report.md',
  'docs/qa-qc-report.md',
  'docs/deployment-checklist.md',
  'docs/production-verification-report.md',
];

test('final reports include commands, artifacts, pass/fail, risks, and cleanup receipts', () => {
  for (const report of FINAL_REPORTS) {
    const text = fs.readFileSync(new URL(`../${report}`, import.meta.url), 'utf8');
    const result = validateFinalReport(text);
    assert.equal(result.ok, true, `${report}: ${result.failures.join(', ')}`);
  }
});

test('rejects TODO-only report', () => {
  const result = validateFinalReport('# Report\n\nTODO: finish later.\n');

  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('contains_todo_marker'));
  assert.ok(result.failures.includes('missing_commands_run'));
});

test('production verification report records live blockers or live results', () => {
  const text = fs.readFileSync(new URL('../docs/production-verification-report.md', import.meta.url), 'utf8');

  assert.match(text, /Live URL/i);
  assert.match(text, /(credential blocker|live status|skipped live step)/i);
  assert.doesNotMatch(text, /production reflects changes/i);
});

const cleanReview = `# Read-only review

## Commands Run
- Read the scoped instructions and compared the proposed patch with the unchanged safety gates.

## Artifacts
- Review evidence is retained in the task's canonical audit record with the reviewed commit and file references.

## Pass/Fail
- Passed the scoped document checks; no production or runtime-health verification was requested or performed.

## Remaining Risks
- None

## Cleanup Receipts
- Not applicable: no services, credentials, or temporary runtime resources were created.
`;

test('a clean review can explicitly report zero remaining risks without inventing a finding', () => {
  assert.deepEqual(validateFinalReport(cleanReview), { ok: true, failures: [] });
});

test('zero-risk allowance does not waive required evidence, cleanup receipts, or risk disclosure', () => {
  const cases = [
    [cleanReview.replace(/## Commands Run[\s\S]*?(?=## Artifacts)/, '## Commands Run\n- None\n\n'), 'empty_commands_run'],
    [cleanReview.replace(/## Cleanup Receipts[\s\S]*/, '## Cleanup Receipts\n- n/a\n'), 'empty_cleanup_receipts'],
    [cleanReview.replace('## Remaining Risks\n- None', '## Remaining Risks\n'), 'empty_remaining_risks'],
    [cleanReview.replace('## Remaining Risks\n- None', '## Remaining Risks\n- n/a'), 'empty_remaining_risks'],
  ];
  for (const [report, failure] of cases) {
    const result = validateFinalReport(report);
    assert.equal(result.ok, false);
    assert.ok(result.failures.includes(failure), failure);
  }
});
