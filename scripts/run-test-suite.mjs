import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function trackedDiff() {
  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', '.'],
    { cwd: root, encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 },
  );
  return stdout;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal || code})`));
    });
  });
}

async function testFiles() {
  return (await fs.readdir(path.join(root, 'tests')))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => path.join('tests', name));
}

export async function runTestSuite(options = {}) {
  const snapshot = options.trackedDiff || trackedDiff;
  const execute = options.run || run;
  const discoverTests = options.testFiles || testFiles;
  const npm = options.npmCommand || npmCommand;
  const node = options.nodeCommand || process.execPath;
  const buildDir = options.buildDir || path.join(root, 'dist');
  const before = await snapshot();
  let runError;

  try {
    await execute(npm, ['run', 'build']);
    await execute(node, ['--test', ...(await discoverTests())], {
      env: { PUBLIC_BUILD_DIR: buildDir },
    });
    for (const gate of ['test:quality-gate', 'test:relevance', 'test:taxonomy', 'test:repetition']) {
      await execute(npm, ['run', gate]);
    }
  } catch (error) {
    runError = error;
  }

  const after = await snapshot();
  const mutationError = before.equals(after)
    ? null
    : new Error('Tracked files changed during npm test; inspect git diff and remove test side effects.');

  if (runError && mutationError) {
    throw new AggregateError(
      [runError, mutationError],
      'Test execution failed and mutated tracked files.',
    );
  }
  if (runError) throw runError;
  if (mutationError) throw mutationError;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) await runTestSuite();
