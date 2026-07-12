import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  benchmarkMarkdown,
  scoreRelevanceReview,
  scoreWritingReview,
} from './lib/human-content-benchmark.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function requiredArg(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || !argv[index + 1]) throw new Error(`${name} is required`);
  return path.resolve(ROOT, argv[index + 1]);
}

function optionalArg(argv, name, fallback) {
  const index = argv.indexOf(name);
  return path.resolve(ROOT, index >= 0 && argv[index + 1] ? argv[index + 1] : fallback);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function main(argv = process.argv.slice(2)) {
  const relevancePath = requiredArg(argv, '--relevance');
  const writingPath = requiredArg(argv, '--writing');
  const outputDir = optionalArg(argv, '--out', 'artifacts/content-benchmark/results');
  const [relevancePacket, writingPacket, latest, archived] = await Promise.all([
    readJson(relevancePath),
    readJson(writingPath),
    readJson(path.join(ROOT, 'src/data/latest-news.json')),
    readJson(path.join(ROOT, 'src/data/archived-news.json')),
  ]);
  const articles = [...latest, ...archived];
  const relevance = scoreRelevanceReview(relevancePacket, articles);
  const writing = scoreWritingReview(writingPacket, articles);
  const result = {
    scored_at: new Date().toISOString(),
    relevance,
    writing,
    pass: relevance.pass && writing.pass,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'results.json'), `${JSON.stringify(result, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, 'results.md'), `${benchmarkMarkdown({
      relevance,
      writing,
      relevanceReviewer: relevancePacket.reviewer,
      writingReviewer: writingPacket.reviewer,
    })}\n`),
  ]);
  console.log(`[benchmark:score] relevance_fpr=${relevance.core_false_positive_rate.toFixed(4)} pass=${result.pass}`);
  if (!result.pass) process.exitCode = 1;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(`[benchmark:score] ${error.message}`);
    process.exitCode = 1;
  });
}
