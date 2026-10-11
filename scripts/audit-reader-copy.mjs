#!/usr/bin/env node
// Offline inventory audit. Historical findings are reported, never rewritten,
// hidden, or mistaken for a full semantic fact-check. --strict is opt-in.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readerCopyResult, editorialReviewWarnings } from './lib/reader-copy-guard.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';
import { buildArchiveFeed } from './lib/archive-feed-builder.mjs';
import { authoredColumnPublicEligible, isAuthoredColumn } from './lib/authored-column-policy.mjs';
import { buildPublicPresentation } from './lib/public-presentation.mjs';

const CARD_FIELDS = ['id', 'title', 'deck', 'why_it_matters', 'image_alt', 'reader_impact', 'signal_label', 'editorial_lens', 'lane_title', 'region', 'source', 'category'];

/**
 * Every card a reader can reach, as the feed builders render it: the full
 * homepage-eligible set (no 50-card cap) plus the archive-eligible set that
 * `/archive/`, category, region and search pages expose through
 * `buildPublicPublicationCatalog`. Signals are de-duplicated by id.
 */
export function publicCardSignalsFor(records = [], options = {}) {
  const homepage = buildHomepageFeed(records, { ...options, limit: Math.max(records.length, 1), minimumVisible: 0 }).items;
  const archive = buildArchiveFeed(records, { ...options, page: 1, pageSize: Math.max(records.length, 1) }).items;
  const signals = new Map();
  for (const item of [...homepage, ...archive]) {
    const signal = item?.publicSignal;
    if (signal?.id && !signals.has(signal.id)) signals.set(signal.id, Object.fromEntries(CARD_FIELDS.map((field) => [field, signal[field]])));
  }
  return [...signals.values()];
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
  const isColumn = (record) => record.collection === 'authored-columns' || isAuthoredColumn(record);
  const signalsById = new Map(homepageSignals.filter((signal) => signal?.id).map((signal) => [signal.id, signal]));
  // The presentation the page header and any card actually render, built the
  // same way src/pages/news/[id].astro and buildHomepageFeed build it. This
  // honors field precedence (persisted deck over top-level deck, synthesized
  // deck from source text when neither exists) instead of auditing raw fields.
  // Authored columns bypass that layer: column/[slug].astro and
  // buildColumnCards() read title, deck, imageAlt and stance.thesis straight
  // off the record, which readerCopyResult(record) already covers.
  const presentationCopyResult = (record) => {
    if (isColumn(record)) return { ok: true, findings: [], reasons: [] };
    const built = buildPublicPresentation(record);
    return readerCopyResult({
      title: built.title, deck: built.deck, why_it_matters: built.why_it_matters, imageAlt: built.image_alt,
      region: built.region, source: built.source,
      public_presentation: { reader_impact: built.reader_impact },
      public_routing: { public_signal_label: built.signal_label, editorial_lens: built.editorial_lens, laneTitle: built.lane_title },
    });
  };
  // Hub and entity pages (src/pages/hubs/[slug].astro, src/pages/entities/
  // [slug].astro) list feed records by their raw title and source, not by the
  // card copy, so a card-only record renders those two stored fields as well.
  const hubListCopyResult = (record) => readerCopyResult({ title: record.title, source: record.source });
  // Every textual field the card components render, mapped onto the guard's
  // presentation surfaces.
  const cardCopyResult = (signal) => readerCopyResult({
    title: signal.title, deck: signal.deck, why_it_matters: signal.why_it_matters, imageAlt: signal.image_alt,
    region: signal.region, source: signal.source, category: signal.category,
    public_presentation: { reader_impact: signal.reader_impact },
    public_routing: { public_signal_label: signal.signal_label, editorial_lens: signal.editorial_lens, laneTitle: signal.lane_title },
  });
  // A column page exists whenever the column route's own predicate accepts the
  // record (`authoredColumnPublicEligible`, which does not read the news-article
  // flag); a news page exists when `articlePagePublished` is true.
  const hasReaderPage = (record) => record.articlePagePublished === true || (isColumn(record) && authoredColumnPublicEligible(record));
  const records = [...unique.values()].filter(hasReaderPage);
  const articles = records.map(record => {
    const body = record.expertLensFull?.finalArticleBody || record.body || '';
    const signal = signalsById.get(record.id);
    const copy = mergeCopyResults(readerCopyResult(record), presentationCopyResult(record), ...(signal ? [cardCopyResult(signal)] : []));
    return {
      id: record.id, collection: record.collection, title: record.title,
      path: isColumn(record) ? `/column/${record.slug}/` : `/news/${record.slug || record.id}/`,
      publishedAt: record.publishedAt || null,
      words: body.trim() ? body.trim().split(/\s+/).length : 0,
      sourceCount: Array.isArray(record.sources) ? record.sources.length : Number(Boolean(record.sourceUrl || record.url)),
      arabicNumericTokensInBody: (body.match(/\b\d+(?:[.,]\d+)*\b/g) || []).length,
      readerCopy: copy, reviewWarnings: editorialReviewWarnings(record),
    };
  });
  // Cards without an article page (signal cards, briefs on the homepage,
  // archive, category, region and search pages) render the same
  // title/deck/why-it-matters copy; check the rendered card and the
  // presentation built from the stored record. A body, figure or correction
  // note nobody can reach is not reader copy for a card-only record, and a
  // top-level field shadowed by a persisted presentation value is not either.
  const articleIds = new Set(articles.map((article) => article.id));
  const cards = [...signalsById.values()].filter((signal) => !articleIds.has(signal.id)).map((signal) => {
    const record = unique.get(signal.id);
    return {
      id: signal.id, collection: record?.collection || null, title: signal.title, path: '/',
      publishedAt: record?.publishedAt || null,
      readerCopy: record ? mergeCopyResults(cardCopyResult(signal), presentationCopyResult(record), hubListCopyResult(record)) : cardCopyResult(signal),
    };
  });
  return {
    scope: 'Stored records with a reader page (articlePagePublished=true, or a column accepted by authoredColumnPublicEligible) plus every card the homepage and archive feeds render; reconcile with live sitemap separately.',
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
  const homepageSignals = publicCardSignalsFor([...collections['latest-news'], ...collections['archived-news']]);
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
