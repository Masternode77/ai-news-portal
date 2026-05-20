import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDeployment } from './lib/deployment-verification.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const result = await verifyDeployment({ siteUrl: process.env.SITE_URL || 'https://www.computecurrent.com' });
console.log(`deployment verification: ${result.ok ? 'pass' : 'fail'}`);
console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
if (!result.ok) {
  console.error(result.failures.join('\n'));
  process.exitCode = 1;
}
