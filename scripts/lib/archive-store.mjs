import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_LIMIT,
  SEARCH_INDEX_PATH,
  SUPABASE_ARCHIVE_TABLE,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from './constants.mjs';
import { readJsonFile, writeJsonFile } from './state-store.mjs';
import { slugify, unique } from './normalize.mjs';

function mergeUniqueArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    if (!article?.id || seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  });
}

function toSearchableArticle(article) {
  return {
    ...article,
    slug: article.slug || slugify(article.title),
    searchText: unique(
      [
        article.title,
        article.source,
        article.category,
        article.region,
        article.summary,
        article.expertLens,
        article.articleText,
        ...(article.tags || []),
      ].filter(Boolean)
    ).join(' '),
  };
}

async function upsertSupabaseArchive(articles) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !articles.length) {
    return { pushed: false, reason: 'missing_env_or_no_articles' };
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${SUPABASE_ARCHIVE_TABLE}?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(
        articles.map((article) => ({
          id: article.id,
          slug: article.slug,
          title: article.title,
          url: article.url,
          source: article.source,
          published_at: article.publishedAt,
          summary: article.summary || null,
          expert_lens: article.expertLens || null,
          category: article.category || null,
          region: article.region || null,
          generated_image: article.generatedImage || null,
          tags: article.tags || [],
          article_text: article.articleText || null,
          archived_at: new Date().toISOString(),
        }))
      ),
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase archive upsert failed: ${response.status}`);
  }

  return { pushed: true, count: articles.length };
}

export async function readArchiveSnapshot() {
  return readJsonFile(ARCHIVE_NEWS_PATH, []);
}

export function splitLatestAndArchive(articles) {
  const sorted = [...articles].sort(
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
