import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresAdminAuthSecurityHooks } from '../api/admin/_postgres-auth.js';

function client(sessionRow = {
  revoked_at: null,
  expires_at: '2099-01-01T00:00:00.000Z',
  session_role: 'admin',
  user_role: 'admin',
  disabled_at: null,
  password_hash: '$argon2id$v=19$m=19456,t=2,p=1$test$hash',
}, userRow = { id: 'owner', disabled_at: null }) {
  const calls = [];
  const sql = {
    calls,
    async unsafe(statement, params = []) {
      calls.push({ statement, params });
      if (/select count/.test(statement)) return [{ count: 4, first_at: '2026-07-12T00:00:00.000Z' }];
      if (/insert into admin_users/.test(statement)) return [userRow];
      if (/select[\s\S]*revoked_at/.test(statement)) return [sessionRow];
      if (/returning id/.test(statement)) return [{ id: 'session-1' }];
      return [];
    },
    async begin(work) { return work(sql); },
  };
  return sql;
}

test('Postgres auth hooks persist hashed login identity and durable session lifecycle', async () => {
  const sql = client();
  process.env.ADMIN_SESSION_SECRET = 'postgres-auth-test-secret-with-at-least-sixty-four-bytes-0123456789abcdef';
  process.env.ADMIN_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$test$hash';
  const hooks = createPostgresAdminAuthSecurityHooks({ sqlClient: sql });
  const check = await hooks.loginThrottle.check({ ip: '203.0.113.42', now: Date.parse('2026-07-12T00:10:00Z') });
  assert.equal(check.count, 4);
  assert.equal(check.blocked, false);
  await hooks.loginThrottle.recordFailure({ ip: '203.0.113.42', username: 'owner', reason: 'invalid_credentials', now: Date.now() });
  await hooks.loginThrottle.recordSuccess({ ip: '203.0.113.42', username: 'owner', now: Date.now() });
  await hooks.sessionRevocation.register({
    session: { sid: 'session-1', sub: 'owner', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
    metadata: { ip: '203.0.113.42', userAgent: 'test' },
  });
  assert.equal(await hooks.sessionRevocation.isRevoked({ sid: 'session-1', sub: 'owner', role: 'admin' }), false);
  assert.equal(await hooks.sessionRevocation.revoke({
    session: { sid: 'session-1', sub: 'owner' },
    revoked: { revokedAt: new Date().toISOString() },
  }), true);

  const serializedParams = JSON.stringify(sql.calls.map((call) => call.params));
  const statements = sql.calls.map((call) => call.statement).join('\n');
  assert.doesNotMatch(serializedParams, /203\.0\.113\.42/);
  assert.match(serializedParams, /[a-f0-9]{64}/);
  assert.match(statements, /min\(admin_login_attempts\.created_at\)/);
  assert.doesNotMatch(statements, /\bactive\b/);
  assert.match(statements, /disabled_at/);
  assert.match(statements, /admin_sessions \(id, user_id, role, expires_at/);
  assert.match(statements, /join admin_users/);
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_PASSWORD_HASH;
});

test('Postgres session validation rejects disabled, downgraded, and rotated accounts', async (t) => {
  process.env.ADMIN_SESSION_SECRET = 'postgres-auth-test-secret-with-at-least-sixty-four-bytes-0123456789abcdef';
  process.env.ADMIN_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$current$hash';
  t.after(() => {
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD_HASH;
  });
  const base = {
    revoked_at: null,
    expires_at: '2099-01-01T00:00:00.000Z',
    session_role: 'admin',
    user_role: 'admin',
    disabled_at: null,
    password_hash: process.env.ADMIN_PASSWORD_HASH,
  };

  for (const override of [
    { disabled_at: '2026-07-18T00:00:00.000Z' },
    { user_role: 'editor' },
    { password_hash: '$argon2id$v=19$m=19456,t=2,p=1$rotated$hash' },
  ]) {
    const hooks = createPostgresAdminAuthSecurityHooks({
      sqlClient: client({ ...base, ...override }),
    });
    assert.equal(
      await hooks.sessionRevocation.isRevoked({ sid: 'session-1', sub: 'owner', role: 'admin' }),
      true,
    );
  }
});

test('Postgres session registration cannot reactivate a disabled account', async (t) => {
  process.env.ADMIN_SESSION_SECRET = 'postgres-auth-test-secret-with-at-least-sixty-four-bytes-0123456789abcdef';
  process.env.ADMIN_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$current$hash';
  t.after(() => {
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD_HASH;
  });
  const hooks = createPostgresAdminAuthSecurityHooks({
    sqlClient: client(undefined, {
      id: 'owner',
      disabled_at: '2026-07-18T00:00:00.000Z',
    }),
  });

  await assert.rejects(
    hooks.sessionRevocation.register({
      session: {
        sid: 'session-disabled',
        sub: 'owner',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    }),
    /disabled/i,
  );
});
