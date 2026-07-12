import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRelevanceReviewPacket,
  buildWritingReviewPacket,
} from './lib/human-content-benchmark.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
}

const outputDir = path.resolve(ROOT, arg('--out', 'artifacts/content-benchmark'));
const seed = arg('--seed', 'compute-current-gpt56-v1');
const [latest, archived] = await Promise.all([
  readJson('src/data/latest-news.json'),
  readJson('src/data/archived-news.json'),
]);
const articles = [...latest, ...archived];
const relevance = buildRelevanceReviewPacket(articles, { seed });
const writing = buildWritingReviewPacket(articles, { seed });

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDir, 'relevance-review.json'), `${JSON.stringify(relevance, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, 'writing-review.json'), `${JSON.stringify(writing, null, 2)}\n`),
]);
console.log(`[benchmark:prepare] relevance=${relevance.sample_size} writing=${writing.sample_size}`);
console.log(`[benchmark:prepare] output=${path.relative(ROOT, outputDir)}`);
