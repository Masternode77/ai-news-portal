import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/public-cache-purge-report.md');
const EMERGENCY_REPORT_PATH = path.join(ROOT, 'docs/emergency-cleanup-report.md');

async function writeReport(lines = []) {
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
}

async function updateEmergencyReport(statusLine = '') {
  try {
    const report = await fs.readFile(EMERGENCY_REPORT_PATH, 'utf8');
    const updated = report.replace(
      /## Cache Purge[\s\S]*?(?=\n## |\n?$)/,
      `## Cache Purge\n\n- ${statusLine}\n`
    );
    await fs.writeFile(EMERGENCY_REPORT_PATH, updated, 'utf8');
  } catch {
    // The cleanup report is created by cleanup/regeneration; cache purge can run independently.
  }
}

async function main() {
  const purgeUrl = process.env.COMPUTE_CURRENT_CACHE_PURGE_URL || process.env.VERCEL_DEPLOY_HOOK_URL || '';
  const token = process.env.COMPUTE_CURRENT_CACHE_PURGE_TOKEN || process.env.VERCEL_TOKEN || '';

  if (!purgeUrl) {
    await writeReport([
      '# Public Cache Purge Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      'Status: skipped',
      'Reason: missing COMPUTE_CURRENT_CACHE_PURGE_URL or VERCEL_DEPLOY_HOOK_URL.',
      '',
      'Static/app/CDN purge hook is wired, but this local run did not have deployment cache credentials.',
    ]);
    await updateEmergencyReport('Skipped locally: missing COMPUTE_CURRENT_CACHE_PURGE_URL or VERCEL_DEPLOY_HOOK_URL.');
    console.log('public cache purge skipped: missing purge URL');
    return;
  }

  const response = await fetch(purgeUrl, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: 'editorial_surface_v2_regeneration',
      cleanup: 'emergency_content_quality_cleanup',
      at: new Date().toISOString(),
    }),
  });
  const body = await response.text().catch(() => '');
  await writeReport([
    '# Public Cache Purge Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Status: ${response.ok ? 'purged' : 'failed'}`,
    `HTTP status: ${response.status}`,
    body ? `Response: ${body.slice(0, 500)}` : 'Response: empty',
  ]);

  if (!response.ok) throw new Error(`public cache purge failed with HTTP ${response.status}`);
  await updateEmergencyReport(`Purge hook completed with HTTP ${response.status}.`);
  console.log('public cache purge completed');
}

await main();
