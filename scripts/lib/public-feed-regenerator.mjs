import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
  SEARCH_INDEX_PATH,
} from './constants.mjs';
import { readJsonFile, writeJsonFile } from './state-store.mjs';
import { routePublicContentTier, PUBLIC_CONTENT_TIERS } from './public-content-tier-router.mjs';
import { generateLongformAnalysis } from './longform-engine.mjs';
import { generateCardCopy } from './card-copy-quality-gate.mjs';
import { buildCategoryPages, archivePages } from './taxonomy-page-builder.mjs';
import { buildCompanyIndex } from './company-entity-index.mjs';
import { buildRegionIndex } from './region-index.mjs';
import { buildHomepageFeed } from './homepage-feed-builder.mjs';
import { buildArchiveFeed } from './archive-feed-builder.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TAXONOMY_PATH = path.join(ROOT, 'src/data/taxonomy-pages.json');

function dateMs(article = {}) {
  const ms = new Date(article.analysisPublishedAt || article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function uniqueById(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function sourceHref(article = {}) {
  return article.sourceUrl || article.url || article.expertLensFull?.sourceLink || '';
}

function laneFor(article = {}) {
  const text = [article.primary_category, article.category, article.infrastructure_layer, article.title].filter(Boolean).join(' ').toLowerCase();
  if (/power|grid|utility/.test(text)) return { laneKey: 'power-grid', laneTitle: 'Power & Grid', editorial_lens: 'Power & Grid' };
  if (/data center|colocation|facility|campus/.test(text)) return { laneKey: 'data-centers', laneTitle: 'Data Centers', editorial_lens: 'Data Centers' };
  if (/cooling|thermal/.test(text)) return { laneKey: 'cooling', laneTitle: 'Cooling', editorial_lens: 'Cooling' };
  if (/cloud|hyperscaler|region/.test(text)) return { laneKey: 'cloud-capacity', laneTitle: 'Cloud Capacity', editorial_lens: 'Cloud Capacity' };
  if (/semiconductor|chip|gpu|hbm|memory|accelerator/.test(text)) return { laneKey: 'semiconductors', laneTitle: 'Silicon & Systems', editorial_lens: 'Silicon & Systems' };
  if (/capital|finance|deal|funding|investor|acquisition/.test(text)) return { laneKey: 'capital-markets', laneTitle: 'Capital & Deals', editorial_lens: 'Capital & Deals' };
  if (/policy|siting|permit|regulation|zoning/.test(text)) return { laneKey: 'regulation', laneTitle: 'Policy & Siting', editorial_lens: 'Policy & Siting' };
  return { laneKey: 'ai-infrastructure', laneTitle: 'AI Infrastructure', editorial_lens: 'AI Infrastructure' };
}

function searchable(article = {}) {
  return {
    ...article,
    slug: article.slug || article.id,
    searchText: [
      article.title,
      article.source,
      article.primary_category,
      article.infrastructure_layer,
      article.deck,
      article.why_it_matters,
      article.expertLensFull?.finalArticleBody,
      ...(article.tags || []),
    ].filter(Boolean).join(' '),
  };
}

function asBrief(article = {}, tierResult = {}, index = 0) {
  const tier = tierResult.tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD
    ? PUBLIC_CONTENT_TIERS.SIGNAL_CARD
    : PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF;
  const lane = laneFor(article);
  const copy = generateCardCopy({ ...article, public_content_tier: tier });
  const publicLabel = tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD ? 'Signal' : copy.signal_label || 'Brief';
  return {
    ...article,
    public_content_tier: tier,
    blog_route: tier,
    publishing_route: tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD ? 'Signal Card' : 'Editorial Brief',
    public_status: tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD ? 'signal' : 'brief',
    homepagePublished: true,
    articlePagePublished: false,
    signalCardOnly: true,
    archiveOnly: false,
    seo_noindex: false,
    noindex: false,
    deck: copy.deck,
    why_it_matters: copy.why_it_matters,
    summary: copy.why_it_matters,
    snippet: copy.deck,
    primary_category: copy.category,
    public_routing: {
      score: tierResult.score,
      visibility: 'adjacent',
      ...lane,
      public_signal_label: publicLabel,
      story_archetype: tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD ? 'Signal' : 'Editorial Brief',
      blocked_reasons: [],
    },
    public_presentation: {
      signal_label: publicLabel,
      editorial_lens: lane.editorial_lens,
      title: article.title,
      deck: copy.deck,
      why_it_matters: copy.why_it_matters,
      reader_impact: ['Operators', 'Capacity planners'],
      region: article.region || 'Global',
      source: article.source || 'Source',
      view_detail: '',
      read_source: sourceHref(article),
      lane_key: lane.laneKey,
      lane_title: lane.laneTitle,
      visibility: 'adjacent',
      story_archetype: tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD ? 'Signal' : 'Editorial Brief',
    },
    regeneration_rank: index + 1,
  };
}

function asHidden(article = {}, tierResult = {}) {
  return {
    ...article,
    public_content_tier: PUBLIC_CONTENT_TIERS.HIDDEN,
    homepagePublished: false,
    articlePagePublished: false,
    signalCardOnly: false,
    archiveOnly: true,
    seo_noindex: true,
    noindex: true,
    public_tier_reasons: tierResult.reasons || ['hidden'],
  };
}

async function writeTaxonomy(all = []) {
  const taxonomy = {
    generatedAt: new Date().toISOString(),
    categories: buildCategoryPages(all),
    companies: buildCompanyIndex(all),
    regions: buildRegionIndex(all),
    archive: archivePages(all, 50),
  };
  await fs.writeFile(TAXONOMY_PATH, `${JSON.stringify(taxonomy, null, 2)}\n`, 'utf8');
  return taxonomy;
}

export async function regeneratePublicFeed(options = {}) {
  const [latest, archived] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
  ]);
  const all = uniqueById([...latest, ...archived]).sort((a, b) => dateMs(b) - dateMs(a));
  const candidates = all.slice(0, options.limit || 200);
  const routed = candidates.map((article) => ({ article, tier: routePublicContentTier(article) }));
  const longformRows = routed
    .filter((row) => row.tier.tier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS)
    .slice(0, options.longformTarget || 15);
  const longformIds = new Set(longformRows.map((row) => row.article.id));
  const briefRows = routed
    .filter((row) => !longformIds.has(row.article.id))
    .filter((row) => [PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF, PUBLIC_CONTENT_TIERS.SIGNAL_CARD].includes(row.tier.tier))
    .slice(0, options.briefTarget || 35);
  const publicIds = new Set([...longformRows.map((row) => row.article.id), ...briefRows.map((row) => row.article.id)]);

  const longforms = longformRows.map((row, index) => generateLongformAnalysis(row.article, {
    evidencePack: row.tier.evidencePack,
    index,
  }));
  const briefs = briefRows.map((row, index) => asBrief(row.article, row.tier, index));
  const hidden = all
    .filter((article) => !publicIds.has(article.id))
    .map((article) => asHidden(article, routePublicContentTier(article)));
  const regenerated = uniqueById([...longforms, ...briefs, ...hidden]).sort((a, b) => dateMs(b) - dateMs(a));
  const latestOut = regenerated.slice(0, 50).map(searchable);
  const archiveOut = regenerated.slice(50).map(searchable);
  const searchIndex = regenerated.map(searchable);

  await writeJsonFile(LATEST_NEWS_PATH, latestOut);
  await writeJsonFile(ARCHIVE_NEWS_PATH, archiveOut);
  await writeJsonFile(SEARCH_INDEX_PATH, searchIndex);
  const taxonomy = await writeTaxonomy([...latestOut, ...archiveOut]);
  const publicSurface = [...latestOut, ...archiveOut];
  const homepageFeed = buildHomepageFeed(publicSurface, { limit: 50, minimumVisible: 30 });
  const archiveFeed = buildArchiveFeed(publicSurface, { pageSize: 50 });

  const counts = {
    candidates: candidates.length,
    longform: longforms.length,
    brief: briefs.filter((article) => article.public_content_tier === PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF).length,
    signal: briefs.filter((article) => article.public_content_tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD).length,
    hidden: hidden.length,
    noindexed: regenerated.filter((article) => article.seo_noindex === true || article.noindex === true).length,
    homepagePublic: homepageFeed.items.length,
    archivePublic: archiveFeed.total,
  };

  return {
    ok: counts.homepagePublic >= 30 && counts.longform >= 10,
    counts,
    latestOut,
    archiveOut,
    taxonomy,
  };
}
