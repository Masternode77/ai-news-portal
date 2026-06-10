import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function localNewsPathsFrom(html) {
  return [...new Set(
    [...html.matchAll(/href=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((href) => href.startsWith('/news/'))
  )].sort();
}

function articleFileFor(distDir, routePath) {
  const slug = routePath.replace(/^\/news\/|\/$/g, '');
  return path.join(distDir, 'news', slug, 'index.html');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function brokenHomepageNewsLinks(distDir) {
  const homepage = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  const paths = localNewsPathsFrom(homepage);
  const broken = [];
  for (const routePath of paths) {
    if (!(await exists(articleFileFor(distDir, routePath)))) {
      broken.push(routePath);
    }
  }
  return broken;
}

test('homepage link audit catches a missing built article page in a fixture', async () => {
  const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homepage-news-links-'));
  try {
    await fs.writeFile(path.join(distDir, 'index.html'), '<a href="/news/missing/">Missing analysis</a>', 'utf8');

    const broken = await brokenHomepageNewsLinks(distDir);

    assert.deepEqual(broken, ['/news/missing/']);
  } finally {
    await fs.rm(distDir, { recursive: true, force: true });
  }
});

test('built homepage has no broken local article links', async () => {
  const broken = await brokenHomepageNewsLinks(path.resolve('dist'));

  assert.deepEqual(broken, []);
});
