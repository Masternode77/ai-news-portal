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
import { publicLongformRouteGates } from './lib/public-surface-eligibility.mjs';
import { articleDetailQualityResult } from './lib/article-detail-quality-gate.mjs';

const CARD_FIELDS = ['id', 'title', 'deck', 'why_it_matters', 'image_alt', 'reader_impact', 'signal_label', 'editorial_lens', 'region', 'source', 'category'];

/**
 * Every card a reader can reach, as the feed builders render it: the full
 * homepage-eligible set (no 50-card cap) plus the archive-eligible set that
 * `/archive/`, category, region and search pages expose through
 * `buildPublicPublicationCatalog`. Each feed builds a record's card with its
 * own recentDecks sequence, so ensureUniqueDeck() can give the archive card a
 * different deck from the homepage card; every distinct rendered variant is
 * returned (same id, different copy) and only exact duplicates are dropped.
 */
export function publicCardSignalsFor(records = [], options = {}) {
  const homepage = buildHomepageFeed(records, { ...options, limit: Math.max(records.length, 1), minimumVisible: 0 }).items;
  const archive = buildArchiveFeed(records, { ...options, page: 1, pageSize: Math.max(records.length, 1) }).items;
  const variants = new Map();
  for (const item of [...homepage, ...archive]) {
    const signal = item?.publicSignal;
    if (!signal?.id) continue;
    const projected = Object.fromEntries(CARD_FIELDS.map((field) => [field, signal[field]]));
    variants.set(JSON.stringify(projected), projected);
  }
  return [...variants.values()];
}

function mergeCopyResults(...results) {
  const findings = results.flatMap((result) => result.findings);
  return { ok: findings.length === 0, findings, reasons: [...new Set(results.flatMap((result) => result.reasons))] };
}

// A news record has a page when every route gate except the reader-copy
// check passes (`newsPageEligible`). A record the detail gate rejects only
// for reader copy stays in scope so the leak is reported rather than hidden;
// one hidden by a non-copy gate (quarantined, archive-only, noindex, product
// fit, source authorization) has no page and is not audited.
export function defaultNewsPageEligible(record, routeOptions = {}) {
  if (!publicLongformRouteGates(record, routeOptions)) return false;
  const quality = articleDetailQualityResult(record, routeOptions);
  return quality.ok || quality.reasons.every((reason) => reason.startsWith('reader_copy:'));
}

export function auditReaderCopy(collections, { homepageSignals = [], routeOptions = {}, newsPageEligible = (record) => defaultNewsPageEligible(record, routeOptions) } = {}) {
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
  // Every rendered variant of a card, grouped by record id (the homepage and
  // archive feeds can render the same record with different copy).
  const signalsById = new Map();
  for (const signal of homepageSignals) {
    if (!signal?.id) continue;
    if (!signalsById.has(signal.id)) signalsById.set(signal.id, []);
    signalsById.get(signal.id).push(signal);
  }
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
      public_routing: { public_signal_label: built.signal_label, editorial_lens: built.editorial_lens },
    });
  };
  // Hub and entity pages (src/pages/hubs/[slug].astro, src/pages/entities/
  // [slug].astro) list feed records by their raw title and source, not by the
  // card copy, so every record with a feed card (page or card-only) renders
  // those two stored fields as well, even when a final headline shadows the
  // raw title everywhere else.
  const hubListCopyResult = (record) => readerCopyResult({ title: record.title, source: record.source });
  // Every textual field the card components render, mapped onto the guard's
  // presentation surfaces.
  const cardCopyResult = (signal) => readerCopyResult({
    title: signal.title, deck: signal.deck, why_it_matters: signal.why_it_matters, imageAlt: signal.image_alt,
    region: signal.region, source: signal.source, category: signal.category,
    public_presentation: { reader_impact: signal.reader_impact },
    public_routing: { public_signal_label: signal.signal_label, editorial_lens: signal.editorial_lens },
  });
  // A column page exists whenever the column route's own predicate accepts the
  // record (`authoredColumnPublicEligible`, which does not read the news-article
  // flag); a news page exists when the news route's gates accept it.
  const hasReaderPage = (record) => (isColumn(record) ? authoredColumnPublicEligible(record) : newsPageEligible(record));
  const records = [...unique.values()].filter(hasReaderPage);
  const articles = records.map(record => {
    const body = record.expertLensFull?.finalArticleBody || record.body || '';
    const signals = signalsById.get(record.id) || [];
    const copy = mergeCopyResults(readerCopyResult(record), presentationCopyResult(record), ...signals.map(cardCopyResult), ...(signals.length ? [hubListCopyResult(record)] : []));
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
  const cards = [...signalsById.entries()].filter(([id]) => !articleIds.has(id)).map(([id, signals]) => {
    const record = unique.get(id);
    const rendered = signals.map(cardCopyResult);
    return {
      id, collection: record?.collection || null, title: signals[0].title, path: '/', variants: signals.length,
      publishedAt: record?.publishedAt || null,
      readerCopy: record ? mergeCopyResults(...rendered, presentationCopyResult(record), hubListCopyResult(record)) : mergeCopyResults(...rendered),
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
