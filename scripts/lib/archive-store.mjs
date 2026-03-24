import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_LIMIT,
  SEARCH_INDEX_PATH,
  SUPABASE_ARCHIVE_TABLE,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from './constants.mjs';
import { hydrateExpertLens, mergeArticleRecords } from './expert-lens.mjs';
import { readJsonFile, writeJsonFile } from './state-store.mjs';
import { slugify, unique } from './normalize.mjs';

function mergeUniqueArticles(articles) {
  const merged = new Map();
  const orderedIds = [];

  for (const article of articles) {
    if (!article?.id) continue;
    if (!merged.has(article.id)) {
      orderedIds.push(article.id);
      merged.set(article.id, hydrateExpertLens(article));
      continue;
    }
    merged.set(article.id, mergeArticleRecords(merged.get(article.id), article));
  }

  return orderedIds.map((id) => merged.get(id));
}

function toSearchableArticle(article) {
  const hydrated = hydrateExpertLens(article);
  const fullLens = hydrated.expertLensFull || {};
  return {
    ...hydrated,
    slug: hydrated.slug || slugify(hydrated.title),
    searchText: unique(
      [
        hydrated.title,
        hydrated.source,
        hydrated.category,
        hydrated.region,
        hydrated.summary,
        hydrated.expertLensShort,
        fullLens.thesis,
        fullLens.whatHappened,
        fullLens.whyThisMatters,
        fullLens.marketMissing,
        fullLens.investors,
        fullLens.operators,
        fullLens.hyperscalers,
        fullLens.watchNext,
        fullLens.finalHeadline,
        fullLens.metaDescription,
        hydrated.articleText,
        ...(hydrated.tags || []),
      ].filter(Boolean)
    ).join(' '),
  };
}

async function upsertSupabaseArchive(articles) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !articles.length) {
    return { pushed: false, reason: 'missing_env_or_no_articles' };
  }

  const rows = articles.map((article) => ({
    id: article.id,
    slug: article.slug,
    title: article.title,
    url: article.url,
    source: article.source,
    published_at: article.publishedAt,
    summary: article.summary || null,
    expert_lens: article.expertLensShort || article.expertLens || null,
    expert_lens_full: article.expertLensFull || null,
    category: article.category || null,
    region: article.region || null,
    generated_image: article.generatedImage || null,
    tags: article.tags || [],
    article_text: article.articleText || null,
    archived_at: new Date().toISOString(),
  }));

  const postRows = async (payloadRows) =>
    fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_ARCHIVE_TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payloadRows),
    });

  let response = await postRows(rows);

  if (!response.ok) {
    response = await postRows(rows.map(({ expert_lens_full, ...row }) => row));
  }

  if (!response.ok) {
    throw new Error(`Supabase archive upsert failed: ${response.status}`);
  }

  return { pushed: true, count: articles.length };
}

export async function readArchiveSnapshot() {
  return readJsonFile(ARCHIVE_NEWS_PATH, []);
}

export function splitLatestAndArchive(articles) {
  const sorted = mergeUniqueArticles(articles).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  return {
    latest: sorted.slice(0, LATEST_NEWS_LIMIT),
    overflow: sorted.slice(LATEST_NEWS_LIMIT),
  };
}

export async function syncArchiveArtifacts(latestArticles, priorArchive = []) {
  const { latest, overflow } = splitLatestAndArchive(latestArticles);
  const archive = mergeUniqueArticles([...overflow, ...priorArchive]).map(toSearchableArticle);
  const latestSearchable = latest.map(toSearchableArticle);

  let supabaseStatus = { pushed: false, reason: 'not_attempted' };
  try {
    supabaseStatus = await upsertSupabaseArchive(
      overflow.map((article) => ({
        ...article,
        slug: article.slug || slugify(article.title),
      }))
    );
  } catch (error) {
    supabaseStatus = { pushed: false, reason: error.message };
  }

  await writeJsonFile(ARCHIVE_NEWS_PATH, archive);
  await writeJsonFile(SEARCH_INDEX_PATH, mergeUniqueArticles([...latestSearchable, ...archive]));

  return {
    latest,
    archive,
    supabaseStatus,
  };
}
