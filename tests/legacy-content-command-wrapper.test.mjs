import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runLegacyContentCommand } from '../scripts/lib/legacy-content-command-wrapper.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('legacy content aliases reject retired arguments before canonical execution', async () => {
  let called = false;
  await assert.rejects(
    () => runLegacyContentCommand('generate:missing-images', 'cycle', {
      args: ['--dry-run'],
      run: async () => { called = true; },
      log: () => {},
    }),
    (error) => error.code === 'unsupported_legacy_arguments'
      && /npm run content:cycle/.test(error.message)
      && /--dry-run/.test(error.message),
  );
  assert.equal(called, false);
});

test('legacy content aliases expose migration help without canonical execution', async () => {
  let called = false;
  const output = [];
  const result = await runLegacyContentCommand('run-content-cycle', 'cycle', {
    args: ['--help'],
    run: async () => { called = true; },
    log: (value) => output.push(JSON.parse(value)),
  });
  assert.equal(called, false);
  assert.equal(result.executed, false);
  assert.equal(output[0].canonicalCommand, 'content:cycle');
});

test('argument-free legacy aliases delegate once with explicit production scope', async () => {
  const calls = [];
  const result = await runLegacyContentCommand('regenerate:public-feed', 'cycle', {
    args: [],
    run: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
    log: () => {},
  });
  assert.deepEqual(calls, [['cycle', { production: true }]]);
  assert.deepEqual(result, { ok: true });
});

test('retired direct scripts fail closed on legacy mutation flags', () => {
  for (const [script, argument] of [
    ['scripts/generate-missing-images.mjs', '--dry-run'],
    ['scripts/run-content-cycle.mjs', '--fixture'],
  ]) {
    const result = spawnSync(process.execPath, [script, argument], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, `${script} must reject ${argument}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /unsupported_legacy_arguments/);
  }
});
