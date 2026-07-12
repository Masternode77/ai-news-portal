import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const client = fs.readFileSync(new URL('../public/admin-cms.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('admin browser controller renders untrusted data through textContent and handles ready-event races', () => {
  assert.doesNotMatch(client, /innerHTML\s*=/);
  assert.match(client, /node\.textContent =/);
  assert.match(client, /compute-current-admin-ready/);
  assert.match(client, /document\.readyState/);
  assert.match(client, /if \(started \|\| !admin\(\)\?\.user\) return/);
});

test('admin browser controller sends CSRF and optimistic concurrency metadata', () => {
  assert.match(client, /X-CSRF-Token/);
  assert.match(client, /expectedVersion/);
  assert.match(client, /permanently-delete:/);
  assert.match(client, /preview\?\.body \|\| preview\?\.text/);
  assert.match(client, /FileReader/);
  assert.match(client, /\/api\/admin\/media/);
});

test('Vercel policy keeps admin pages private and preserves legacy admin locations', () => {
  const adminHeader = vercel.headers.find((entry) => entry.source === '/admin/(.*)');
  assert.ok(adminHeader);
  assert.ok(adminHeader.headers.some((header) => header.key === 'Cache-Control' && /no-store/.test(header.value)));
  assert.ok(adminHeader.headers.some((header) => header.key === 'X-Robots-Tag' && /noindex/.test(header.value)));
  assert.ok(vercel.redirects.some((entry) => entry.source === '/admin/edit/:id'));
  assert.ok(vercel.redirects.some((entry) => entry.source === '/admin' && entry.destination === '/admin/login/'));
});

test('Vercel admin functions include file-backed editorial policy at runtime', () => {
  assert.equal(
    vercel.functions?.['api/admin/*.js']?.includeFiles,
    '{config/**/*.yml,config/**/*.json,src/data/{editorial-cycles,claim-ledger,source-health}.json}',
  );
});
