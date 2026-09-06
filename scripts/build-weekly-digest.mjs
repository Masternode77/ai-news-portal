import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildWeeklyDigest, renderWeeklyDigestHtml } from './lib/newsletter.mjs';

const rootUrl = new URL('../', import.meta.url);
const formatArg = process.argv.find((argument) => argument.startsWith('--format='));
const nowArg = process.argv.find((argument) => argument.startsWith('--now='));
const format = formatArg?.slice('--format='.length) || 'json';
const now = nowArg ? new Date(nowArg.slice('--now='.length)) : new Date();

if (!['json', 'html'].includes(format)) {
  throw new TypeError('Expected --format=json or --format=html');
}

const [latest, archived] = await Promise.all([
  fs.readFile(fileURLToPath(new URL('src/data/latest-news.json', rootUrl)), 'utf8').then(JSON.parse),
  fs.readFile(fileURLToPath(new URL('src/data/archived-news.json', rootUrl)), 'utf8').then(JSON.parse),
]);
const digest = buildWeeklyDigest([...latest, ...archived], { now });

process.stdout.write(format === 'html'
  ? `${renderWeeklyDigestHtml(digest)}\n`
  : `${JSON.stringify(digest, null, 2)}\n`);
