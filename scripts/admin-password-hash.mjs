import { hashAdminPassword } from '../api/admin/_auth.js';

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(value, next);
      index += 1;
    } else {
      flags.add(value);
    }
  }
  return { args, flags };
}

const { args, flags } = parseArgs();
const password = args.get('--password') || '';

if (!password) {
  console.error('Usage: node scripts/admin-password-hash.mjs --password <temporary-password> [--dry-run]');
  process.exitCode = 1;
} else {
  const hash = hashAdminPassword(password);
  const [, algorithm = '', , parameters = '', salt = '', derived = ''] = hash.split('$');
  const payload = {
    dryRun: flags.has('--dry-run'),
    algorithm,
    parameters,
    saltLength: salt.length,
    derivedKeyLength: derived.length,
    env: `ADMIN_PASSWORD_HASH=${hash}`,
  };
  console.log([
    payload.env,
    `algorithm=${payload.algorithm}`,
    `parameters=${payload.parameters}`,
    `saltLength=${payload.saltLength}`,
    `derivedKeyLength=${payload.derivedKeyLength}`,
    'Store this hash in ADMIN_PASSWORD_HASH and rotate ADMIN_SESSION_SECRET at the same time.',
  ].join('\n'));
}
