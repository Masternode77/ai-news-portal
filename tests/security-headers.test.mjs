import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

function headersFor(source) {
  return Object.fromEntries(
    (config.headers?.find((entry) => entry.source === source)?.headers || [])
      .map(({ key, value }) => [key.toLowerCase(), value]),
  );
}

test('public responses declare browser security policy', () => {
  const headers = headersFor('/(.*)');
  assert.match(headers['content-security-policy'] || '', /default-src 'self'/);
  assert.match(headers['content-security-policy'] || '', /frame-ancestors 'none'/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['permissions-policy'] || '', /camera=\(\)/);
});

test('admin APIs are explicitly non-cacheable', () => {
  const headers = headersFor('/api/admin/(.*)');
  assert.equal(headers['cache-control'], 'no-store');
});
