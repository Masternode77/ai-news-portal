import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  auditStaticPerformance,
  evaluatePerformanceBudget,
} from '../scripts/lib/performance-budget.mjs';

test('performance budget reports each bounded static asset class', () => {
  const result = evaluatePerformanceBudget({
    distBytes: 900,
    totalBrowserJsBytes: 100,
    totalCssBytes: 200,
    largestHtml: { path: 'index.html', bytes: 300 },
    largestImage: { path: 'lead.webp', bytes: 400 },
  }, {
    distBytes: 1_000,
    totalBrowserJsBytes: 100,
    totalCssBytes: 200,
    largestHtmlBytes: 300,
    largestImageBytes: 400,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((check) => check.name), [
    'distBytes',
    'totalBrowserJsBytes',
    'totalCssBytes',
    'largestHtmlBytes',
    'largestImageBytes',
  ]);
});

test('performance budget fails closed when any asset exceeds its limit', () => {
  const result = evaluatePerformanceBudget({
    distBytes: 1,
    totalBrowserJsBytes: 101,
    totalCssBytes: 1,
    largestHtml: null,
    largestImage: null,
  }, {
    distBytes: 100,
    totalBrowserJsBytes: 100,
    totalCssBytes: 100,
    largestHtmlBytes: 100,
    largestImageBytes: 100,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.checks.filter((check) => !check.ok).map((check) => check.name), ['totalBrowserJsBytes']);
});

test('static measurement walks nested build output and records largest assets', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'performance-budget-'));
  try {
    await fs.mkdir(path.join(directory, '_astro'));
    await fs.mkdir(path.join(directory, 'generated'));
    await Promise.all([
      fs.writeFile(path.join(directory, 'index.html'), 'x'.repeat(30)),
      fs.writeFile(path.join(directory, '_astro', 'app.js'), 'x'.repeat(20)),
      fs.writeFile(path.join(directory, '_astro', 'app.css'), 'x'.repeat(10)),
      fs.writeFile(path.join(directory, 'generated', 'lead.webp'), 'x'.repeat(40)),
    ]);
    const result = await auditStaticPerformance(directory, {
      distBytes: 100,
      totalBrowserJsBytes: 20,
      totalCssBytes: 10,
      largestHtmlBytes: 30,
      largestImageBytes: 40,
    });
    assert.equal(result.ok, true);
    assert.equal(result.measurement.fileCount, 4);
    assert.deepEqual(result.measurement.largestHtml, { path: 'index.html', extension: '.html', bytes: 30 });
    assert.deepEqual(result.measurement.largestImage, { path: 'generated/lead.webp', extension: '.webp', bytes: 40 });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
