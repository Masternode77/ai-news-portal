import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function runAdminStorageMigrations({
  databaseUrl = process.env.DATABASE_URL,
  migrationDirectory = path.join(ROOT, 'migrations'),
  sqlClient,
} = {}) {
  if (!databaseUrl && !sqlClient) throw new Error('DATABASE_URL is required for admin storage migrations');
  const ownsClient = !sqlClient;
  const sql = sqlClient || postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
    prepare: false,
  });
  const files = (await fs.readdir(migrationDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();

  const execute = (client, body, params = []) => client.unsafe(body, params);

  try {
    await execute(sql, `
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    const appliedRows = await execute(sql, 'select version from schema_migrations');
    const known = new Set((appliedRows || []).map((row) => row.version));
    const applied = [];
    const skipped = [];
    for (const name of files) {
      if (known.has(name)) {
        skipped.push(name);
        continue;
      }
      const body = await fs.readFile(path.join(migrationDirectory, name), 'utf8');
      await sql.begin(async (transaction) => {
        await execute(transaction, body);
        await execute(transaction, 'insert into schema_migrations (version) values ($1) on conflict (version) do nothing', [name]);
      });
      known.add(name);
      applied.push(name);
    }
    return { applied, skipped };
  } finally {
    if (ownsClient) await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runAdminStorageMigrations()
    .then((result) => {
      console.log(`[admin:migrate] applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`);
    })
    .catch((error) => {
      console.error(`[admin:migrate] ${error.message}`);
      process.exitCode = 1;
    });
}
