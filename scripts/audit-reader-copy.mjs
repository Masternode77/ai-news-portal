#!/usr/bin/env node
// Offline inventory audit. Historical findings are reported, never rewritten,
// hidden, or mistaken for a full semantic fact-check. --strict is opt-in.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readerCopyResult, editorialReviewWarnings } from './lib/reader-copy-guard.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';

const CARD_FIELDS = ['id', 'title', 'deck', 'why_it_matters', 'image_alt'];

/** The card copy the homepage actually renders, as `buildHomepageFeed` produces it. */
export function homepageSignalsFor(records = [], options = {}) {
  return buildHomepageFeed(records, { limit: 50, minimumVisible: 30, ...options }).items
    .map((item) => item.publicSignal)
    .filter((signal) => signal?.id)
    .map((signal) => Object.fromEntries(CARD_FIELDS.map((field) => [field, signal[field]])));
}

function mergeCopyResults(...results) {
  const findings = results.flatMap((result) => result.findings);
  return { ok: findings.length === 0, findings, reasons: [...new Set(results.flatMap((result) => result.reasons))] };
}

export function auditReaderCopy(collections, { homepageSignals = [] } = {}) {
  const unique = new Map();
  const collectionCounts = {};
  for (const [collection, records] of Object.entries(collections)) {
    if (!Array.isArray(records)) throw new TypeError(`${collection} must be an array`);
    collectionCounts[collection] = records.length;
    for (const record of records) {
      if (!record?.id) throw new TypeError(`${collection} contains a record without an id`);
      if (!unique.has(record.id)) unique.set(record.id, { ...record, collection });
    }
  }
  const signalsById = new Map(homepageSignals.filter((signal) => signal?.id).map((signal) => [signal.id, signal]));
  const cardCopyResult = (signal) => readerCopyResult({ title: signal.title, deck: signal.deck, why_it_matters: signal.why_it_matters, imageAlt: signal.image_alt });
  const records = [...unique.values()].filter(record => record.articlePagePublished === true);
  const articles = records.map(record => {
    const body = record.expertLensFull?.finalArticleBody || record.body || '';
    const signal = signalsById.get(record.id);
    const copy = signal ? mergeCopyResults(readerCopyResult(record), cardCopyResult(signal)) : readerCopyResult(record);
    return {
      id: record.id, collection: record.collection, title: record.title,
      path: record.collection === 'authored-columns' ? `/column/${record.slug}/` : `/news/${record.slug || record.id}/`,
      publishedAt: record.publishedAt || null,
      words: body.trim() ? body.trim().split(/\s+/).length : 0,
      sourceCount: Array.isArray(record.sources) ? record.sources.length : Number(Boolean(record.sourceUrl || record.url)),
      arabicNumericTokensInBody: (body.match(/\b\d+(?:[.,]\d+)*\b/g) || []).length,
      readerCopy: copy, reviewWarnings: editorialReviewWarnings(record),
    };
  });
  // Homepage cards without an article page (signal cards, briefs) render the
  // same title/deck/why-it-matters copy; check the rendered card and the
  // stored record behind it.
  const articleIds = new Set(articles.map((article) => article.id));
  const cards = [...signalsById.values()].filter((signal) => !articleIds.has(signal.id)).map((signal) => {
    const record = unique.get(signal.id);
    return {
      id: signal.id, collection: record?.collection || null, title: signal.title, path: '/',
      publishedAt: record?.publishedAt || null,
      readerCopy: record ? mergeCopyResults(cardCopyResult(signal), readerCopyResult(record)) : cardCopyResult(signal),
    };
  });
  return {
    scope: 'Stored records with articlePagePublished=true plus the homepage cards buildHomepageFeed renders; reconcile with live sitemap separately.',
    interpretation: 'Deterministic copy findings and review signals are not factual-error verdicts. A clean result does not certify accuracy.',
    collectionCounts, uniqueRecords: unique.size, publishedRecords: articles.length,
    publishedWords: articles.reduce((sum, article) => sum + article.words, 0),
    readerCopyFlaggedArticles: articles.filter(article => !article.readerCopy.ok).length,
    reviewWarningArticles: articles.filter(article => article.reviewWarnings.length).length,
    homepageCards: cards.length,
    readerCopyFlaggedCards: cards.filter(card => !card.readerCopy.ok).length,
    articles,
    cards,
  };
}

export function main(args = process.argv.slice(2), cwd = process.cwd()) {
  let out = null;
  let strict = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--strict') strict = true;
    else if (args[i] === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) out = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  const collections = Object.fromEntries(['authored-columns', 'latest-news', 'archived-news'].map(name => [name, JSON.parse(fs.readFileSync(path.join(cwd, 'src/data', `${name}.json`), 'utf8'))]));
  let commit = null;
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* A source export may not contain .git. */ }
  const homepageSignals = homepageSignalsFor([...collections['latest-news'], ...collections['archived-news']]);
  const report = { generatedAt: new Date().toISOString(), commit, ...auditReaderCopy(collections, { homepageSignals }) };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (out) {
    const target = path.resolve(cwd, out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialized);
  } else process.stdout.write(serialized);
  return strict && (report.readerCopyFlaggedArticles > 0 || report.readerCopyFlaggedCards > 0) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
