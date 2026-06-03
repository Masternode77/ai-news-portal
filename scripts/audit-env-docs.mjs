import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REQUIRED_ENV_VARS = [
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD_HASH',
  'ADMIN_SESSION_SECRET',
  'GITHUB_TOKEN',
  'GITHUB_REPO',
  'GITHUB_BRANCH',
  'PIPELINE_OFFLINE',
  'CONTENT_CYCLE_FIXTURE',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_SITE_URL',
  'OPENROUTER_APP_TITLE',
  'IMAGE_PROVIDER',
  'OPENAI_API_KEY',
  'OPENAI_IMAGE_MODEL',
  'OPENAI_IMAGE_SIZE',
  'OPENAI_IMAGE_QUALITY',
  'IMAGE2_HERO_SIZE',
  'IMAGE2_OUTPUT_FORMAT',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ARCHIVE_TABLE',
  'COMPUTE_CURRENT_CACHE_PURGE_URL',
  'COMPUTE_CURRENT_CACHE_PURGE_TOKEN',
  'VERCEL_DEPLOY_HOOK_URL',
  'VERCEL_TOKEN',
  'PUBLIC_OUTPUT_ARTICLE_LIMIT',
  'PUBLIC_OUTPUT_MIN_LONGFORM_CHARS',
];

const REQUIRED_DOC_PHRASES = [
  'ADMIN_PASSWORD_HASH',
  'ADMIN_SESSION_SECRET',
  'secret rotation',
  'IMAGE_PROVIDER=image2',
  'category fallback',
  'public/generated/articles',
  'npm run content:cycle',
  'npm run content:gate',
  'COMPUTE_CURRENT_CACHE_PURGE_URL',
  'Local verification',
  'Staging verification',
  'Production verification',
];

function read(filePath) {
  return fs.readFileSync(path.resolve(ROOT, filePath), 'utf8');
}

function envKeys(raw = '') {
  return new Set(String(raw).split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.split('=')[0]));
}

function secretLeaks(raw = '') {
  const leaks = [];
  for (const line of String(raw).split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    if (/(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-|-----BEGIN )/.test(line)) leaks.push(line.split('=')[0]);
    if (/^ADMIN_PASSWORD=/.test(line)) leaks.push('ADMIN_PASSWORD');
  }
  return leaks;
}

export function auditEnvDocs(options = {}) {
  const envPath = options.envPath || '.env.example';
  const docs = options.docs || [];
  const envRaw = read(envPath);
  const keys = envKeys(envRaw);
  const failures = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!keys.has(key)) failures.push(`missing env: ${key}`);
  }
  for (const leak of secretLeaks(envRaw)) failures.push(`real-looking secret or plaintext password in env: ${leak}`);

  const docsText = docs.map(read).join('\n');
  for (const phrase of REQUIRED_DOC_PHRASES) {
    if (!new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(docsText)) {
      failures.push(`docs missing phrase: ${phrase}`);
    }
  }
  if (secretLeaks(docsText).length) failures.push('docs contain real-looking secret material');

  return { ok: failures.length === 0, failures, envPath, docs };
}

function parseArgs(argv = process.argv.slice(2)) {
  const envIndex = argv.indexOf('--env');
  const docsIndex = argv.indexOf('--docs');
  return {
    envPath: envIndex === -1 ? '.env.example' : argv[envIndex + 1],
    docs: docsIndex === -1 ? [] : argv.slice(docsIndex + 1),
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = auditEnvDocs(parseArgs());
  if (!result.ok) {
    console.error(`env docs audit failed:\n${result.failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`env docs audit passed: ${REQUIRED_ENV_VARS.length} env vars documented across ${result.docs.length} docs`);
  }
}
