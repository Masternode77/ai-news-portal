import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_ROOT = path.join(ROOT, 'src/pages/admin');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

test('admin page sources never embed private datasets or enumerate article ids', () => {
  const pageFiles = [path.join(ROOT, 'src/pages/admin.astro'), ...walk(ADMIN_ROOT)]
    .filter((file) => file.endsWith('.astro'));

  for (const file of pageFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /src\/data|\.\.\/data\//, path.relative(ROOT, file));
    assert.doesNotMatch(source, /getStaticPaths/, path.relative(ROOT, file));
  }
});

test('required CMS routes are thin noindex shells', () => {
  const required = [
    'login.astro',
    'dashboard.astro',
    'articles/index.astro',
    'articles/new.astro',
    'articles/editor.astro',
    'sources.astro',
    'quarantine.astro',
    'pipeline.astro',
    'audit-log.astro',
  ];

  for (const relative of required) {
    const file = path.join(ADMIN_ROOT, relative);
    assert.equal(fs.existsSync(file), true, `missing ${relative}`);
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /AdminCmsShell/);
    assert.doesNotMatch(source, /latest-news\.json|archived-news\.json|claim-ledger\.json/);
  }
});

test('public footer exposes only a nofollow admin login entry', () => {
  const footer = fs.readFileSync(path.join(ROOT, 'src/components/PublicSiteFooter.astro'), 'utf8');
  assert.match(footer, /href="\/admin\/login\/" rel="nofollow">Admin</);
  assert.doesNotMatch(footer, /\/admin\/(?:dashboard|articles|pipeline|audit-log)/);
});
