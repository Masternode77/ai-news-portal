import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const STATUS_DIR = path.join(ROOT, 'artifacts', 'visual-status');
const CAPTURE_JSON = path.join(STATUS_DIR, 'capture.json');
const SCREENSHOT_PATH = path.join(ROOT, 'artifacts', 'homepage.png');
const REQUIRED_VISUAL_QA = process.env.GITHUB_ACTIONS === 'true';

async function writeStatus(payload) {
  await fs.mkdir(STATUS_DIR, { recursive: true });
  await fs.writeFile(CAPTURE_JSON, JSON.stringify({
    checkedAt: new Date().toISOString(),
    ...payload,
  }, null, 2));
}

function runNodeScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function main() {
  const distIndex = path.join(ROOT, 'dist', 'index.html');
  const captureScript = path.join(ROOT, 'scripts', 'capture-homepage.mjs');

  try {
    await fs.access(distIndex);
  } catch {
    await writeStatus({
      status: REQUIRED_VISUAL_QA ? 'failed' : 'unavailable',
      reason: 'dist_missing',
      detail: 'Build output not found. Run `npm run build` before visual capture.',
      environmentConstraint: !REQUIRED_VISUAL_QA,
    });
    console.log(`[qa:visual:capture] ${REQUIRED_VISUAL_QA ? 'failed' : 'unavailable'}: dist output missing`);
    if (REQUIRED_VISUAL_QA) process.exitCode = 1;
    return;
  }

  try {
    await import('playwright');
  } catch (error) {
    await writeStatus({
      status: REQUIRED_VISUAL_QA ? 'failed' : 'unavailable',
      reason: 'playwright_not_installed',
      detail: error?.message || 'playwright package is not installed',
      environmentConstraint: !REQUIRED_VISUAL_QA,
    });
    console.log(`[qa:visual:capture] ${REQUIRED_VISUAL_QA ? 'failed' : 'unavailable'}: playwright is not installed`);
    if (REQUIRED_VISUAL_QA) process.exitCode = 1;
    return;
  }

  const exitCode = await runNodeScript(captureScript);

  if (exitCode !== 0) {
    await writeStatus({
      status: REQUIRED_VISUAL_QA ? 'failed' : 'unavailable',
      reason: 'capture_script_failed',
      detail: 'capture-homepage.mjs exited with a non-zero code. See command output above.',
      environmentConstraint: !REQUIRED_VISUAL_QA,
    });
    console.log(`[qa:visual:capture] ${REQUIRED_VISUAL_QA ? 'failed' : 'unavailable'}: capture script failed`);
    if (REQUIRED_VISUAL_QA) process.exitCode = exitCode;
    return;
  }

  const stat = await fs.stat(SCREENSHOT_PATH).catch(() => null);
  if (!stat || stat.size === 0) {
    await writeStatus({
      status: 'failed',
      reason: 'screenshot_missing',
      detail: 'Capture script completed but screenshot artifact was not created.',
    });
    process.exitCode = 1;
    return;
  }

  await writeStatus({
    status: 'passed',
    reason: 'capture_complete',
    artifact: path.relative(ROOT, SCREENSHOT_PATH),
    bytes: stat.size,
  });
  console.log('[qa:visual:capture] passed');
}

await main();
