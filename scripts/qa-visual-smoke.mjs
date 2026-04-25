import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const STATUS_DIR = path.join(ROOT, 'artifacts', 'visual-status');
const CAPTURE_JSON = path.join(STATUS_DIR, 'capture.json');
const SMOKE_JSON = path.join(STATUS_DIR, 'smoke.json');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');
const SCREENSHOT_PATH = path.join(ROOT, 'artifacts', 'homepage.png');

async function writeStatus(payload) {
  await fs.mkdir(STATUS_DIR, { recursive: true });
  await fs.writeFile(SMOKE_JSON, JSON.stringify({
    checkedAt: new Date().toISOString(),
    ...payload,
  }, null, 2));
}

async function main() {
  const captureRaw = await fs.readFile(CAPTURE_JSON, 'utf8').catch(() => null);
  if (!captureRaw) {
    await writeStatus({
      status: 'skipped',
      reason: 'capture_status_missing',
      detail: 'Run `npm run qa:visual:capture` first.',
    });
    console.log('[qa:visual:smoke] skipped: capture status missing');
    return;
  }

  const capture = JSON.parse(captureRaw);
  if (capture.status !== 'passed') {
    await writeStatus({
      status: 'skipped',
      reason: 'capture_not_passed',
      detail: `Capture status is ${capture.status}; smoke check skipped.`,
      captureReason: capture.reason || null,
      environmentConstraint: Boolean(capture.environmentConstraint),
    });
    console.log(`[qa:visual:smoke] skipped: capture status is ${capture.status}`);
    return;
  }

  const [distStat, screenshotStat] = await Promise.all([
    fs.stat(DIST_INDEX).catch(() => null),
    fs.stat(SCREENSHOT_PATH).catch(() => null),
  ]);

  const failures = [];
  if (!distStat || distStat.size === 0) failures.push('dist_index_missing');
  if (!screenshotStat || screenshotStat.size === 0) failures.push('screenshot_missing');

  if (failures.length > 0) {
    await writeStatus({
      status: 'failed',
      reason: 'artifact_validation_failed',
      failures,
      detail: 'Capture passed but one or more required artifacts are missing.',
    });
    console.log('[qa:visual:smoke] failed');
    process.exitCode = 1;
    return;
  }

  await writeStatus({
    status: 'passed',
    reason: 'artifact_validation_passed',
    checks: {
      distIndexBytes: distStat.size,
      screenshotBytes: screenshotStat.size,
    },
  });
  console.log('[qa:visual:smoke] passed');
}

await main();
