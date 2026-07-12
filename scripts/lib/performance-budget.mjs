import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_PERFORMANCE_BUDGETS = Object.freeze({
  distBytes: 10_000_000,
  totalBrowserJsBytes: 150_000,
  totalCssBytes: 150_000,
  largestHtmlBytes: 150_000,
  largestImageBytes: 500_000,
});

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function largest(records) {
  return records.reduce((current, record) => (
    !current || record.bytes > current.bytes ? record : current
  ), null);
}

export async function measureStaticPerformance(distDirectory) {
  const root = path.resolve(distDirectory);
  const files = await walk(root);
  const records = await Promise.all(files.map(async (file) => ({
    path: path.relative(root, file).split(path.sep).join('/'),
    extension: path.extname(file).toLowerCase(),
    bytes: (await fs.stat(file)).size,
  })));
  const scripts = records.filter((record) => record.extension === '.js');
  const styles = records.filter((record) => record.extension === '.css');
  const html = records.filter((record) => record.extension === '.html');
  const images = records.filter((record) => IMAGE_EXTENSIONS.has(record.extension));
  return {
    fileCount: records.length,
    distBytes: records.reduce((sum, record) => sum + record.bytes, 0),
    totalBrowserJsBytes: scripts.reduce((sum, record) => sum + record.bytes, 0),
    totalCssBytes: styles.reduce((sum, record) => sum + record.bytes, 0),
    largestHtml: largest(html),
    largestImage: largest(images),
  };
}

export function evaluatePerformanceBudget(measurement, budgets = DEFAULT_PERFORMANCE_BUDGETS) {
  const checks = [
    ['distBytes', measurement.distBytes, budgets.distBytes],
    ['totalBrowserJsBytes', measurement.totalBrowserJsBytes, budgets.totalBrowserJsBytes],
    ['totalCssBytes', measurement.totalCssBytes, budgets.totalCssBytes],
    ['largestHtmlBytes', measurement.largestHtml?.bytes || 0, budgets.largestHtmlBytes],
    ['largestImageBytes', measurement.largestImage?.bytes || 0, budgets.largestImageBytes],
  ].map(([name, actual, limit]) => ({ name, actual, limit, ok: actual <= limit }));
  return {
    ok: checks.every((check) => check.ok),
    checks,
    measurement,
  };
}

export async function auditStaticPerformance(distDirectory, budgets = DEFAULT_PERFORMANCE_BUDGETS) {
  return evaluatePerformanceBudget(await measureStaticPerformance(distDirectory), budgets);
}
