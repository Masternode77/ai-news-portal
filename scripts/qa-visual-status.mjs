import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const STATUS_DIR = path.join(ROOT, 'artifacts', 'visual-status');
const files = ['capture.json', 'smoke.json'];

async function readJson(name) {
  const filePath = path.join(STATUS_DIR, name);
  const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (!raw) return { status: 'missing', file: path.relative(ROOT, filePath) };
  return { file: path.relative(ROOT, filePath), ...JSON.parse(raw) };
}

const summary = {};
for (const file of files) {
  summary[file.replace('.json', '')] = await readJson(file);
}

console.log(JSON.stringify(summary, null, 2));

const required = process.env.GITHUB_ACTIONS === 'true';
if (required) {
  const failures = Object.entries(summary).filter(([, result]) => result.status !== 'passed');
  if (failures.length > 0) {
    console.error(`[qa:visual:status] required checks did not pass: ${failures.map(([name, result]) => `${name}:${result.status}`).join(', ')}`);
    process.exitCode = 1;
  }
}
