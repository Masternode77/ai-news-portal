import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditAdminExclusion } from '../scripts/audit-admin-exclusion.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const GENERIC_ADMIN_SHELL = '<html><head><meta name="robots" content="noindex,nofollow"></head><body>Authenticated editor shell</body></html>';

async function fixtureDist(files) {
  const distDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'compute-current-admin-editor-leak-'));
  await Promise.all(Object.entries(files).map(async ([relativePath, contents]) => {
    const filePath = path.join(distDir, relativePath);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, contents, 'utf8');
  }));
  return distDir;
}

test('admin editor page is one data-free typed bootstrap and client owns the query/API boundary', () => {
  // Given: the filesystem-routed admin editor source.
  const shellPath = path.join(ROOT, 'src/pages/admin/edit.astro');
  const dynamicPath = path.join(ROOT, 'src/pages/admin/edit/[id].astro');
  const clientPath = path.join(ROOT, 'src/lib/admin-editor/client.ts');

  // When: its route topology, page bootstrap, and typed client boundary are inspected.
  const shellExists = fs.existsSync(shellPath);
  const dynamicExists = fs.existsSync(dynamicPath);
  const source = shellExists ? fs.readFileSync(shellPath, 'utf8') : '';
  const client = fs.readFileSync(clientPath, 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1]?.trim() || '';

  // Then: the page contains only the typed bootstrap; client owns query and authenticated API access.
  assert.equal(shellExists, true);
  assert.equal(dynamicExists, false);
  assert.doesNotMatch(source, /latest-news\.json|archived-news\.json|getStaticPaths|Astro\.props|data-article-id/);
  assert.equal(script, "import { startAdminEditor } from '../../lib/admin-editor/client';\n\n    startAdminEditor(document);");
  assert.doesNotMatch(source, /URLSearchParams\(window\.location\.search\)|\/api\/admin\/article/);
  assert.match(client, /URLSearchParams\(window\.location\.search\)/);
  assert.match(client, /\/api\/admin\/article\?id=/);
});

test('admin exclusion audit rejects per-record static editor pages', async () => {
  // Given: a build containing the allowed editor shell and one legacy per-record page.
  const distDir = await fixtureDist({
    'robots.txt': 'User-agent: *\nDisallow: /admin\nDisallow: /api/admin\n',
    'sitemap.xml': '<urlset></urlset>',
    'admin/edit/index.html': GENERIC_ADMIN_SHELL,
    'admin/edit/private-record/index.html': GENERIC_ADMIN_SHELL,
  });

  // When: private output is audited.
  const result = await auditAdminExclusion({ distDir });

  // Then: the nested record page fails closed while the bounded shell remains allowed.
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('/admin/edit/private-record/')));
  assert.ok(result.failures.every((failure) => !failure.startsWith('/admin/edit/:')));
});

test('admin exclusion audit rejects private record markers inside a bounded editor shell', async () => {
  // Given: an allowed shell path whose HTML contains a private record marker.
  const privateMarker = 'private-record-title-marker';
  const distDir = await fixtureDist({
    'robots.txt': 'User-agent: *\nDisallow: /admin\nDisallow: /api/admin\n',
    'sitemap.xml': '<urlset></urlset>',
    'admin/edit/index.html': GENERIC_ADMIN_SHELL.replace('</body>', `${privateMarker}</body>`),
  });

  // When: the audit receives the canonical private marker inventory.
  const result = await auditAdminExclusion({ distDir, privateMarkers: [privateMarker] });

  // Then: marker leakage fails closed even on an otherwise allowed shell route.
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('private record marker')));
});
