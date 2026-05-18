import test from 'node:test';
import assert from 'node:assert/strict';
import { adminRouteAuthResult } from '../src/lib/admin-route-auth.js';

function basic(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

test('admin route auth blocks admin pages when no password is configured', () => {
  const result = adminRouteAuthResult('', {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

test('admin route auth requires matching basic auth credentials', () => {
  const env = { ADMIN_USERNAME: 'editor', ADMIN_PASSWORD: 'secret' };
  assert.equal(adminRouteAuthResult('', env).status, 401);
  assert.equal(adminRouteAuthResult(basic('editor', 'wrong'), env).ok, false);
  assert.equal(adminRouteAuthResult(basic('editor', 'secret'), env).ok, true);
});
