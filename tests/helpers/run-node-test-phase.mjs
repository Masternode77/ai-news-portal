import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIRECTORY = path.resolve('tests');
const BUILT_TESTS = new Set([
  'commercialization-surface.test.mjs',
  'admin-cjk-word-boundary-runtime.test.mjs',
  'admin-editor-response-boundary.test.mjs',
  'admin-preview-image-request-boundary.test.mjs',
  'fallback-artwork-topline-rss-runtime.test.mjs',
  'feed-xsl-hover-runtime.test.mjs',
  'homepage-link-integrity.test.mjs',
  'visual-truthfulness-runtime.test.mjs',
]);

const phase = process.argv[2];
if (phase !== 'source' && phase !== 'built') {
  console.error('Usage: node tests/helpers/run-node-test-phase.mjs <source|built>');
  process.exitCode = 2;
} else {
  const allTestFiles = fs.readdirSync(TEST_DIRECTORY)
    .filter((fileName) => fileName.endsWith('.test.mjs'))
    .sort();
  const missingBuiltTests = [...BUILT_TESTS].filter((fileName) => !allTestFiles.includes(fileName));
  if (missingBuiltTests.length > 0) {
    throw new Error(`Missing configured built test files: ${missingBuiltTests.join(', ')}`);
  }

  const testFiles = allTestFiles
    .filter((fileName) => BUILT_TESTS.has(fileName) === (phase === 'built'))
    .map((fileName) => path.join('tests', fileName));

  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
