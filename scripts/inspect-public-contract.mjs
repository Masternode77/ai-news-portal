#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  migratePublicArticleContract,
  publicArticleContractSummary,
  validatePublicArticleContract,
} from './lib/public-article-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATHS = [
  'src/data/latest-news.json',
  'src/data/archived-news.json',
  'src/data/search-index.json',
  'src/data/taxonomy-pages.json',
];

function usage() {
  return [
    'Usage:',
    '  node scripts/inspect-public-contract.mjs --id <article-id> [--json]',
    '  node scripts/inspect-public-contract.mjs --fixture <path> [--json]',
  ].join('\n');
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, id: '', fixture: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    if (arg === '--id') {
      args.id = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--fixture') {
      args.fixture = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    args.error = `unknown argument: ${arg}`;
  }
  return args;
}

function readJson(relativeOrAbsolutePath) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(ROOT, relativeOrAbsolutePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenTaxonomyItems(taxonomy = {}) {
  const pages = [
    ...(taxonomy.categories || []),
    ...(taxonomy.companies || []),
    ...(taxonomy.regions || []),
    ...(taxonomy.archive || []),
  ];
  return pages.flatMap((page) => page.items || []);
}

function loadAllArticleRecords() {
  const records = [];
  for (const dataPath of DATA_PATHS) {
    const value = readJson(dataPath);
    if (Array.isArray(value)) {
      records.push(...value);
    } else if (dataPath.endsWith('taxonomy-pages.json')) {
      records.push(...flattenTaxonomyItems(value));
    }
  }
  return records;
}

function findArticleById(id) {
  return loadAllArticleRecords().find((article) => article?.id === id);
}

function printHuman(summary) {
  const lines = [
    `id: ${summary.id}`,
    `status: ${summary.status}`,
    `tier: ${summary.tier}`,
    `publicUrl: ${summary.publicUrl || '(none)'}`,
    `sitemapEligible: ${summary.sitemapEligible}`,
    `rssEligible: ${summary.rssEligible}`,
    `adminEditable: ${summary.adminEditable}`,
    `unknownFieldsPreserved: ${summary.unknownFieldsPreserved}`,
    `imageStatus: ${summary.image.status}`,
  ];
  console.log(lines.join('\n'));
}

const args = parseArgs();

if (args.help) {
  console.log(usage());
  process.exit(0);
}

if (args.error || (!args.id && !args.fixture) || (args.id && args.fixture)) {
  console.error(args.error || usage());
  process.exit(1);
}

let record;
try {
  record = args.fixture ? readJson(args.fixture) : findArticleById(args.id);
} catch (error) {
  console.error(`failed to read article input: ${error.message}`);
  process.exit(1);
}

if (!record) {
  console.error(`article not found: ${args.id}`);
  process.exit(1);
}

const migration = migratePublicArticleContract(record);
const validation = validatePublicArticleContract(migration.contract);
const errors = [...new Set([...migration.errors, ...validation.errors])];

if (errors.length) {
  console.error(`public contract invalid for ${args.id || args.fixture}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const summary = publicArticleContractSummary(migration);
if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printHuman(summary);
}
