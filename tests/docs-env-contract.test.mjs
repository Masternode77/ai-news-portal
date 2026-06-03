import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { auditEnvDocs, REQUIRED_ENV_VARS } from '../scripts/audit-env-docs.mjs';

const REQUIRED_DOCS = [
  'docs/admin-setup.md',
  'docs/image-generation-setup.md',
  'docs/content-cycle-runbook.md',
  'docs/automation-runbook.md',
  'docs/deployment-checklist.md',
];

test('.env.example documents required runtime variables without real secrets', () => {
  const env = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  for (const key of REQUIRED_ENV_VARS) {
    assert.match(env, new RegExp(`^${key}=`, 'm'), `${key} missing`);
  }
  assert.doesNotMatch(env, /ADMIN_PASSWORD=/);
  assert.doesNotMatch(env, /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-)/);
});

test('operator docs cover admin, image, cycle, automation, and deployment duties', () => {
  const docs = REQUIRED_DOCS.map((file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
  for (const phrase of [
    'ADMIN_PASSWORD_HASH',
    'ADMIN_SESSION_SECRET',
    'secret rotation',
    'IMAGE_PROVIDER=image2',
    'category fallback',
    'public/generated/articles',
    'npm run content:cycle',
    'npm run content:gate',
    'COMPUTE_CURRENT_CACHE_PURGE_URL',
    'Local verification',
    'Staging verification',
    'Production verification',
  ]) {
    assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
});

test('env docs audit passes and password hash dry run hides plaintext', () => {
  const audit = auditEnvDocs({ envPath: '.env.example', docs: REQUIRED_DOCS });
  assert.equal(audit.ok, true, audit.failures.join('\n'));

  const output = childProcess.execFileSync('node', ['scripts/admin-password-hash.mjs', '--password', 'test-password', '--dry-run'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.match(output, /ADMIN_PASSWORD_HASH=scrypt\$/);
  assert.doesNotMatch(output, /test-password/);
});
