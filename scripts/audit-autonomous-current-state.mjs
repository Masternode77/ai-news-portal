import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import searchIndex from '../src/data/search-index.json' with { type: 'json' };
import newsPool from '../src/data/news-pool.json' with { type: 'json' };
import { shouldNoindexArticle } from '../src/lib/seo-safeguards.js';
import { headingSequence, visibleBodyText } from './lib/visible-body-length.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/autonomous-editorial-desk-current-state.md');
const PIPELINE_STATE_PATH = path.join(ROOT, 'scripts/state/pipeline-state.json');

const AI_PHRASES = [
  'Commercially,',
  'Operationally,',
  'worth a local Compute Current read',
  'puts power under',
  'lens for infrastructure readers',
  'reported item can translate into',
  'readers should test whether',
  'not just another AI headline',
  'not merely adding another generic AI headline',
  'source-backed change',
];

const RESPONSIBILITY_MAP = [
  ['Card copy and public presentation', 'scripts/lib/public-presentation.mjs -> buildPublicPresentation; scripts/lib/editorial-excerpt-generator.mjs -> generateEditorialExcerpt; src/components/PublicSignalCard.astro renders the fields.'],
  ['Article body generation', 'scripts/lib/blog-engine-v4.mjs -> generateBlogArticle; scripts/lib/evidence-pack-builder.mjs -> buildEvidencePack; scripts/lib/analyst-draft-writer.mjs and scripts/lib/human-editor-rewrite.mjs shape body copy.'],
  ['Fallback body/deck language', 'scripts/lib/blog-engine-v4.mjs -> deckFor, whyFor, extensionParagraphs; scripts/lib/evidence-pack-builder.mjs -> commercialImplication and operatingImplication.'],
  ['Freshness display', 'src/pages/index.astro -> stats array, formatTimeAgo, live-brief section.'],
  ['RSS generation', 'src/pages/rss.xml.ts -> GET; scripts/lib/seo-quality-policy.mjs -> rssItemEligible.'],
  ['Archive counts/search', 'src/pages/index.astro -> archiveCount/searchPayload; scripts/lib/archive-store.mjs -> syncArchiveArtifacts.'],
  ['Homepage lane rendering', 'src/pages/index.astro -> topConstraint, localBlogSurfaceItems, intelligenceSections; src/components/PublicSignalCard.astro.'],
  ['Article page routing', 'src/pages/news/[id].astro -> getStaticPaths, articleDetailQualityEligible, shouldNoindexArticle.'],
  ['Sitemap filtering', 'astro.config.mjs -> @astrojs/sitemap filter; src/lib/seo-safeguards.js -> shouldNoindexArticle.'],
];

function dateMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function latestDate(items, fields) {
  const ms = Math.max(0, ...items.flatMap((item) => fields.map((field) => dateMs(item?.[field]))));
  return ms ? new Date(ms).toISOString() : 'not_found';
}

function within(items, hours) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return items.filter((item) => dateMs(item.publishedAt || item.fetchedAt || item.updatedAt) >= cutoff).length;
}

function articleText(article = {}) {
  return [
    article.title,
    article.deck,
    article.summary,
    article.snippet,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    article.expertLensFull?.finalArticleBody,
    article.expertLensFull?.metaDescription,
  ].filter(Boolean).join('\n\n');
}

function phraseCounts(items) {
  const out = new Map(AI_PHRASES.map((phrase) => [phrase, 0]));
  for (const article of items) {
    const text = articleText(article);
    for (const phrase of AI_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out.set(phrase, out.get(phrase) + (text.match(new RegExp(escaped, 'gi')) || []).length);
    }
  }
  return out;
}

function numericClaims(text = '') {
  return visibleBodyText(text).match(/\b\d+(?:\.\d+)?\s?(?:GW|MW|kW|billion|million|%|percent|years?|months?|days?|sq\.?\s?ft|megawatts?|gigawatts?)\b/gi) || [];
}

function firstWords(text = '', count = 10) {
  return visibleBodyText(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).slice(0, count).join(' ');
}

function repeatedOpenings(items) {
  const seen = new Map();
  const repeats = [];
  for (const article of items) {
    const body = article.expertLensFull?.finalArticleBody || '';
    const key = firstWords(body);
    if (!key) continue;
    if (seen.has(key)) repeats.push([key, seen.get(key), article.id]);
    else seen.set(key, article.id);
  }
  return repeats;
}

function repeatedHeadingSequences(items) {
  const seen = new Map();
  const repeats = [];
  for (const article of items) {
    const seq = headingSequence(article.expertLensFull?.finalArticleBody || '').join(' > ');
    if (!seq) continue;
    if (seen.has(seq)) repeats.push([seq, seen.get(seq), article.id]);
    else seen.set(seq, article.id);
  }
  return repeats;
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function grepFiles(patterns, files) {
  const rows = [];
  for (const file of files) {
    let text = '';
    try {
      text = await fs.readFile(path.join(ROOT, file), 'utf8');
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      if (text.includes(pattern)) rows.push({ pattern, file });
    }
  }
  return rows;
}

export async function auditAutonomousCurrentState() {
  const pipelineState = await readJson(PIPELINE_STATE_PATH, {});
  const all = [...latestNews, ...archivedNews];
  const publicLocal = all.filter((article) => article.articlePagePublished !== false && !shouldNoindexArticle(article));
  const homepageVisible = latestNews.filter((article) => article.homepagePublished !== false && article.archiveOnly !== true);
  const sourceOnly = homepageVisible.filter((article) => article.articlePagePublished === false || article.signalCardOnly === true);
  const archivedOnly = all.filter((article) => article.archiveOnly === true || article.public_status === 'archive_only_noindex');
  const extractionBlocked = all.filter((article) => (article.extraction_quality_score ?? 1) < 0.8 || article.extraction_qa?.public_publishable === false);
  const relevanceBlocked = all.filter((article) => (article.infrastructure_relevance_score ?? 1) < 0.55 || article.infrastructure_relevance_action === 'archive_only');
  const articlePageFalse = all.filter((article) => article.articlePagePublished === false);
  const homepageFalse = all.filter((article) => article.homepagePublished === false);
  const noindexItems = all.filter((article) => shouldNoindexArticle(article));
  const rssItems = all.filter((article) => article.articlePagePublished !== false && !shouldNoindexArticle(article)).length;
  const sitemapIndexable = rssItems;
  const phrases = phraseCounts([homepageVisible, publicLocal.slice(0, 30)].flat());
  const numericNoLedger = publicLocal.filter((article) => numericClaims(article.expertLensFull?.finalArticleBody || '').length && !Array.isArray(article.claim_ledger));
  const openingRepeats = repeatedOpenings(publicLocal.slice(0, 30));
  const headingRepeats = repeatedHeadingSequences(publicLocal.slice(0, 30));
  const codePhraseHits = await grepFiles(AI_PHRASES, [
    'scripts/lib/blog-engine-v4.mjs',
    'scripts/lib/evidence-pack-builder.mjs',
    'scripts/lib/editorial-excerpt-generator.mjs',
    'scripts/lib/public-presentation.mjs',
    'src/pages/index.astro',
    'src/pages/rss.xml.ts',
    'src/pages/news/[id].astro',
  ]);

  const lines = [
    '# Autonomous Editorial Desk Current State Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Pipeline And Public Counts',
    '',
    `- latest pipeline run time: ${pipelineState.lastRunAt || pipelineState.updatedAt || 'not_found'}`,
    `- latest source scan time: ${pipelineState.lastSourceScanAt || pipelineState.lastFetchedAt || 'not_found'}`,
    `- latest source article date: ${latestDate([...newsPool, ...all], ['publishedAt'])}`,
    `- latest published Compute Current analysis date: ${latestDate(publicLocal, ['updatedAt', 'publishedAt'])}`,
    `- articles crawled in last 8h / 24h / 7d: ${within(newsPool, 8)} / ${within(newsPool, 24)} / ${within(newsPool, 24 * 7)}`,
    `- items passing extraction QA: ${all.length - extractionBlocked.length}`,
    `- items passing relevance QA: ${all.length - relevanceBlocked.length}`,
    `- generated local articles: ${publicLocal.length}`,
    `- homepage-visible cards: ${homepageVisible.length}`,
    `- source-only/direct-link cards: ${sourceOnly.length}`,
    `- archived-only items: ${archivedOnly.length}`,
    `- RSS-eligible items: ${rssItems}`,
    `- sitemap-indexable items: ${sitemapIndexable}`,
    `- category/tag pages: 0 real dynamic category/tag routes currently present`,
    `- company/region pages: 0 real company/region routes currently present`,
    `- current homepage local blog count: ${latestNews.filter((article) => article.articlePagePublished !== false && article.homepagePublished !== false).length}`,
    '',
    '## Why Items Are Not Local Blog Posts',
    '',
    `- extraction quality below threshold or failed extraction: ${extractionBlocked.length}`,
    `- relevance below threshold or archive action: ${relevanceBlocked.length}`,
    `- articlePagePublished false: ${articlePageFalse.length}`,
    `- homepagePublished false: ${homepageFalse.length}`,
    `- archiveOnly true/public archive-only: ${archivedOnly.length}`,
    `- noindex true/policy noindex: ${noindexItems.length}`,
    `- missing local slug/id: ${all.filter((article) => !article.id && !article.slug).length}`,
    `- stale generation version not autonomous_editorial_desk_v1: ${all.filter((article) => article.generation_version !== 'autonomous_editorial_desk_v1').length}`,
    '',
    '## Repeated AI Phrase Counts',
    '',
    ...[...phrases.entries()].map(([phrase, count]) => `- "${phrase}": ${count}`),
    '',
    '## Verification Gaps',
    '',
    `- latest public/local articles with numeric claims but no claim ledger: ${numericNoLedger.length}`,
    `- repeated opening first 10 words in latest 30 public articles: ${openingRepeats.length}`,
    `- repeated heading sequences in latest 30 public articles: ${headingRepeats.length}`,
    '',
    '## Where Current Copy Comes From',
    '',
    ...RESPONSIBILITY_MAP.map(([area, file]) => `- ${area}: ${file}`),
    '',
    '## Static Phrase Source Hits',
    '',
    ...(codePhraseHits.length
      ? codePhraseHits.map((hit) => `- "${hit.pattern}" found in ${hit.file}`)
      : ['- none found in scanned generator/rendering files']),
    '',
    '## Diagnosis',
    '',
    'The public surface feels like AI-generated summary content because the previous recovery system optimized for filling a homepage with 20 local posts. `blog-engine-v4` extends body length using reusable operating/commercial paragraphs, while `evidence-pack-builder` supplies generic commercial and operating implication sentences. The public deck path then preserves those reusable phrases through `buildPublicPresentation`, `PublicSignalCard`, RSS descriptions, and detail metadata. The homepage freshness model is count-based rather than cycle-based, so old backfilled analyses can appear beside "Live Brief" and "8h Refresh" without proving a recent editorial cycle produced new qualifying signals.',
    '',
    '## Required Runtime Change Direction',
    '',
    '- Replace article-by-article backfill with persisted 8-hour editorial cycles.',
    '- Select signal clusters, not individual feed items, and publish at most 2-3 verified analyses per cycle.',
    '- Persist claim ledgers for numeric and operational assertions.',
    '- Render freshness and no-qualifying-signal states truthfully.',
    '- Make category, company, region, archive, RSS, and sitemap pages reflect public published analysis rather than internal raw archive volume.',
  ];

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  return {
    reportPath: REPORT_PATH,
    counts: {
      total: all.length,
      homepageVisible: homepageVisible.length,
      publicLocal: publicLocal.length,
      sourceOnly: sourceOnly.length,
      archivedOnly: archivedOnly.length,
      numericNoLedger: numericNoLedger.length,
      repeatedOpenings: openingRepeats.length,
      repeatedHeadingSequences: headingRepeats.length,
    },
    phraseCounts: Object.fromEntries(phrases),
    codePhraseHits,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await auditAutonomousCurrentState();
  console.log(`autonomous current-state audit written: ${path.relative(ROOT, result.reportPath)}`);
  console.log(JSON.stringify(result.counts, null, 2));
}
