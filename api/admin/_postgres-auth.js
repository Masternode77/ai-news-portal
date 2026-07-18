import crypto from 'node:crypto';
import postgres from 'postgres';

function createClient(databaseUrl) {
  return postgres(databaseUrl, {
    max: Math.max(1, Number(process.env.ADMIN_DATABASE_POOL_SIZE) || 1),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
}

function hashNetworkValue(value) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || 'unconfigured')
    .update(String(value || 'unknown'))
    .digest('hex');
}

function query(client, statement, params = []) {
  return client.unsafe(statement, params);
}

export function createPostgresAdminAuthSecurityHooks({ databaseUrl = process.env.DATABASE_URL, sqlClient } = {}) {
  if (!databaseUrl && !sqlClient) return null;
  const sql = sqlClient || createClient(databaseUrl);
  const ipHash = (ip) => hashNetworkValue(ip);

  return {
    loginThrottle: {
      async check({ ip, now }) {
        const windowStart = new Date(now - (15 * 60 * 1000)).toISOString();
        const rows = await query(sql, `
          with last_success as (
            select max(created_at) as created_at
            from admin_login_attempts
            where ip_hash = $1 and success = true
          )
          select count(*)::integer as count, min(admin_login_attempts.created_at) as first_at
          from admin_login_attempts, last_success
          where ip_hash = $1
            and success = false
            and created_at >= $2
            and (last_success.created_at is null or admin_login_attempts.created_at > last_success.created_at)
        `, [ipHash(ip), windowStart]);
        const count = Number(rows?.[0]?.count || 0);
        const firstAt = rows?.[0]?.first_at ? new Date(rows[0].first_at).getTime() : now;
        return {
          blocked: count >= 5,
          count,
          retryAfterSeconds: count >= 5 ? Math.max(1, Math.ceil(((15 * 60 * 1000) - (now - firstAt)) / 1000)) : 0,
        };
      },
      async recordFailure({ ip, username, reason, now }) {
        await query(sql, `
          insert into admin_login_attempts (id, ip_hash, username, success, reason, created_at)
          values ($1, $2, $3, false, $4, $5)
        `, [crypto.randomUUID(), ipHash(ip), String(username || '').slice(0, 96), String(reason || '').slice(0, 48), new Date(now).toISOString()]);
        return true;
      },
      async recordSuccess({ ip, username, now }) {
        await query(sql, `
          insert into admin_login_attempts (id, ip_hash, username, success, reason, created_at)
          values ($1, $2, $3, true, 'authenticated', $4)
        `, [crypto.randomUUID(), ipHash(ip), String(username || '').slice(0, 96), new Date(now).toISOString()]);
        return true;
      },
    },
    sessionRevocation: {
      async register({ session, metadata = {} }) {
        const safeMetadata = { ...metadata, ipHash: hashNetworkValue(metadata.ip) };
        delete safeMetadata.ip;
        await sql.begin(async (transaction) => {
          const users = await query(transaction, `
            insert into admin_users (id, username, role, password_hash, disabled_at, created_at, updated_at)
            values ($1, $1, $2, $3, null, now(), now())
            on conflict (id) do update
              set role = excluded.role, password_hash = excluded.password_hash, updated_at = now()
            returning id, disabled_at
          `, [session.sub, session.role, process.env.ADMIN_PASSWORD_HASH || 'external-auth']);
          if (!users?.length || users[0].disabled_at) {
            throw new Error('admin_account_disabled');
          }
          await query(transaction, `
            insert into admin_sessions (id, user_id, role, expires_at, revoked_at, metadata, created_at, updated_at)
            values ($1, $2, $3, $4, null, $5::jsonb, now(), now())
            on conflict (id) do update
              set expires_at = excluded.expires_at, revoked_at = null, metadata = excluded.metadata, updated_at = now()
          `, [session.sid, session.sub, session.role, new Date(session.exp * 1000).toISOString(), JSON.stringify(safeMetadata)]);
        });
        return true;
      },
      async isRevoked(session) {
        const rows = await query(sql, `
          select
            admin_sessions.revoked_at,
            admin_sessions.expires_at,
            admin_sessions.role as session_role,
            admin_users.role as user_role,
            admin_users.disabled_at,
            admin_users.password_hash
          from admin_sessions
          join admin_users on admin_users.id = admin_sessions.user_id
          where admin_sessions.id = $1 and admin_sessions.user_id = $2
          limit 1
        `, [session.sid, session.sub]);
        const row = rows?.[0];
        return !row
          || Boolean(row.revoked_at)
          || Boolean(row.disabled_at)
          || new Date(row.expires_at).getTime() <= Date.now()
          || row.session_role !== row.user_role
          || row.session_role !== session.role
          || row.password_hash !== process.env.ADMIN_PASSWORD_HASH;
      },
      async revoke({ session, revoked }) {
        const rows = await query(sql, `
          update admin_sessions
          set revoked_at = $3, metadata = metadata || $4::jsonb, updated_at = $3
          where id = $1 and user_id = $2 and revoked_at is null
          returning id
        `, [session.sid, session.sub, revoked.revokedAt, JSON.stringify({ revokedBy: session.sub })]);
        return Boolean(rows?.length);
      },
    },
    async close() {
      if (!sqlClient && typeof sql.end === 'function') await sql.end({ timeout: 5 });
    },
  };
}
