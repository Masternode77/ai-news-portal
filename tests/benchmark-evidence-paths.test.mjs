import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const benchmarkPath = path.join(root, 'docs/commercialization-benchmarks.md');
const repositoryPathPattern = /^(?:README\.md|\.env\.example|package\.json|astro\.config\.mjs|vercel\.json|(?:src|scripts|public|docs|config|api|\.github)\/)/;

function mappedRepositoryPaths(markdown) {
  return [...new Set(
    [...markdown.matchAll(/\*\*([^*]+)\*\*/g)]
      .map((match) => match[1])
      .filter((value) => repositoryPathPattern.test(value)),
  )];
}

function citationUrls(markdown) {
  return [...markdown.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);
}

test('Given the tracked benchmark When reading its research structure Then all eight cases and their citations remain self-contained', () => {
  const markdown = fs.readFileSync(benchmarkPath, 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.equal((markdown.match(/^### Case \d+ —/gm) || []).length, 8);
  assert.ok(citationUrls(markdown).length >= 8, 'each comparator needs at least one cited URL');
  assert.doesNotMatch(markdown, /\.omo\//);
  assert.match(readme, /\]\(docs\/commercialization-benchmarks\.md\)/);
});

test('Given benchmark implementation mappings When resolving their repository paths Then every mapping exists', () => {
  const markdown = fs.readFileSync(benchmarkPath, 'utf8');
  const mappedPaths = mappedRepositoryPaths(markdown);
  const missing = mappedPaths.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));

  assert.ok(mappedPaths.length > 0, 'benchmark must contain repository mappings');
  assert.deepEqual(missing, []);
});

test('Given the tracked benchmark When projecting it into an archive mirror Then it needs neither .omo nor .git', () => {
  const markdown = fs.readFileSync(benchmarkPath, 'utf8');
  const mappedPaths = mappedRepositoryPaths(markdown);
  const mirrorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'compute-current-benchmark-mirror-'));
  const mirrorBenchmarkPath = path.join(mirrorRoot, 'docs/commercialization-benchmarks.md');

  try {
    for (const relativePath of mappedPaths) {
      const sourcePath = path.join(root, relativePath);
      const mirrorPath = path.join(mirrorRoot, relativePath);
      fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
      fs.cpSync(sourcePath, mirrorPath, { recursive: true });
    }
    fs.mkdirSync(path.dirname(mirrorBenchmarkPath), { recursive: true });
    fs.copyFileSync(benchmarkPath, mirrorBenchmarkPath);

    const mirroredMarkdown = fs.readFileSync(mirrorBenchmarkPath, 'utf8');
    const missing = mappedRepositoryPaths(mirroredMarkdown)
      .filter((relativePath) => !fs.existsSync(path.join(mirrorRoot, relativePath)));

    assert.equal(fs.existsSync(path.join(mirrorRoot, '.omo')), false);
    assert.equal(fs.existsSync(path.join(mirrorRoot, '.git')), false);
    assert.deepEqual(missing, []);
  } finally {
    fs.rmSync(mirrorRoot, { recursive: true, force: true });
  }
});
