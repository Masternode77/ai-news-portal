import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/cache-purge-report.md');

async function writeReport(lines = []) {
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const purgeUrl = process.env.COMPUTE_CURRENT_CACHE_PURGE_URL || '';
  const token = process.env.COMPUTE_CURRENT_CACHE_PURGE_TOKEN || '';

  if (!purgeUrl) {
    await writeReport([
      '# Cache Purge Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      'Status: skipped',
      'Reason: missing COMPUTE_CURRENT_CACHE_PURGE_URL.',
      '',
      'The repository now includes the purge hook, but this local run did not have deployment cache credentials.',
      'VERCEL_DEPLOY_HOOK_URL is a deploy trigger, not a cache-purge endpoint, and is intentionally ignored here.',
    ]);
    console.log('cache purge skipped: missing purge URL');
    return;
  }

  const response = await fetch(purgeUrl, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: 'narrative_dna_regeneration',
      at: new Date().toISOString(),
    }),
  });

  const body = await response.text().catch(() => '');
  await writeReport([
    '# Cache Purge Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Status: ${response.ok ? 'purged' : 'failed'}`,
    `HTTP status: ${response.status}`,
    body ? `Response: ${body.slice(0, 500)}` : 'Response: empty',
  ]);

  if (!response.ok) {
    throw new Error(`cache purge failed with HTTP ${response.status}`);
  }

  console.log('cache purge completed');
}

await main();
