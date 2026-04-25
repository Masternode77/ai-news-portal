import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const STATUS_DIR = path.join(ROOT, 'artifacts', 'visual-status');
const PERCY_JSON = path.join(STATUS_DIR, 'percy.json');

async function writeStatus(payload) {
  await fs.mkdir(STATUS_DIR, { recursive: true });
  await fs.writeFile(PERCY_JSON, JSON.stringify({ checkedAt: new Date().toISOString(), ...payload }, null, 2));
}

function commandExists(command, args = ['--version']) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'ignore', shell: false });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

function run(command, args, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: 'inherit', shell: false });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function main() {
  if (!process.env.PERCY_TOKEN) {
    await writeStatus({ status: 'skipped', reason: 'missing_percy_token' });
    console.log('[qa:visual:percy] skipped: PERCY_TOKEN is not set');
    return;
  }

  const distIndex = path.join(ROOT, 'dist', 'index.html');
  const hasDist = await fs.stat(distIndex).then((stat) => stat.size > 0, () => false);
  if (!hasDist) {
    await writeStatus({ status: 'skipped', reason: 'dist_missing' });
    console.log('[qa:visual:percy] skipped: dist output missing');
    return;
  }

  const hasPercy = await commandExists('npx', ['--no-install', 'percy', '--version']);
  if (!hasPercy) {
    await writeStatus({
      status: 'skipped',
      reason: 'percy_cli_not_installed',
      detail: 'Install @percy/cli to enable Percy uploads; visual artifact smoke still runs without it.',
      environmentConstraint: true,
    });
    console.log('[qa:visual:percy] skipped: @percy/cli is not installed');
    return;
  }

  const code = await run('npx', ['--no-install', 'percy', 'snapshot', 'dist']);
  if (code !== 0) {
    await writeStatus({ status: 'failed', reason: 'percy_snapshot_failed' });
    process.exitCode = code;
    return;
  }

  await writeStatus({ status: 'passed', reason: 'percy_snapshot_uploaded' });
}

await main();
