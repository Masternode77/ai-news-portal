const DEFAULT_REPO = 'Masternode77/ai-news-portal';
const DATA_FILES = ['src/data/latest-news.json', 'src/data/archived-news.json'];
const SEARCH_FILE = 'src/data/search-index.json';

function githubConfig() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.COMPUTE_CURRENT_GITHUB_TOKEN || '';
  return {
    token,
    repo: process.env.GITHUB_REPO || DEFAULT_REPO,
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

async function github(path, options = {}) {
  const { token, repo } = githubConfig();
  if (!token) {
    throw new Error('GitHub token is not configured. Set GITHUB_TOKEN with repo contents access.');
  }

  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'compute-current-admin-editor',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || `GitHub request failed with ${response.status}`);
  }
  return payload;
}

async function decodeContent(file) {
  if (file.content) {
    return Buffer.from(file.content, 'base64').toString('utf8');
  }

  const blob = await github(`/git/blobs/${file.sha}`);
  return Buffer.from(blob.content || '', 'base64').toString('utf8');
}

async function readJsonFile(path) {
  const { branch } = githubConfig();
  const file = await github(`/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`);
  const text = await decodeContent(file);
  return {
    path,
    sha: file.sha,
    text,
    data: JSON.parse(text),
  };
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(normalizeText)
    .filter(Boolean);
}

function buildSearchText(article) {
  return [
    article.title,
    article.source,
    article.category,
    article.region,
    article.summary,
    article.expertLensShort,
    article.expertLens,
    article.expertLensFull?.finalHeadline,
    article.expertLensFull?.thesis,
    article.expertLensFull?.finalArticleBody,
    ...(article.tags || []),
  ]
    .filter(Boolean)
    .join(' ');
}

function applyArticlePatch(article, patch) {
  const next = structuredClone(article);
  next.expertLensFull = next.expertLensFull || {};

  if ('title' in patch) {
    next.title = normalizeText(patch.title);
    next.expertLensFull.finalHeadline = normalizeText(patch.title);
  }
  if ('summary' in patch) next.summary = normalizeText(patch.summary);
  if ('expertLensShort' in patch) {
    next.expertLensShort = normalizeText(patch.expertLensShort);
    next.expertLens = normalizeText(patch.expertLensShort);
    next.expertLensFull.thesis = normalizeText(patch.expertLensShort);
  }
  if ('finalArticleBody' in patch) {
    next.expertLensFull.finalArticleBody = String(patch.finalArticleBody || '').trim();
  }
  if ('metaDescription' in patch) next.expertLensFull.metaDescription = normalizeText(patch.metaDescription);
  if ('category' in patch) next.category = normalizeText(patch.category);
  if ('region' in patch) next.region = normalizeText(patch.region);
  if ('sourceImage' in patch) next.sourceImage = normalizeText(patch.sourceImage);
  if ('generatedImage' in patch) next.generatedImage = normalizeText(patch.generatedImage);
  if ('tags' in patch) next.tags = normalizeTags(patch.tags);

  next.searchText = buildSearchText(next);
  next.updatedAt = new Date().toISOString();
  return next;
}

async function findArticle(id) {
  const files = await Promise.all(DATA_FILES.map(readJsonFile));
  for (const file of files) {
    const index = file.data.findIndex((article) => article?.id === id);
    if (index !== -1) {
      return { files, file, index, article: file.data[index] };
    }
  }
  return { files, file: null, index: -1, article: null };
}

export async function getEditableArticle(id) {
  const { file, article } = await findArticle(id);
  if (!article) return null;
  return { article, sourceFile: file.path };
}

async function commitFiles(updates, message) {
  const { branch } = githubConfig();
  const ref = await github(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = ref.object.sha;
  const headCommit = await github(`/git/commits/${headSha}`);

  const treeEntries = await Promise.all(
    updates.map(async (update) => {
      const blob = await github('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({
          content: update.text,
          encoding: 'utf-8',
        }),
      });
      return {
        path: update.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      };
    }),
  );

  const tree = await github('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree: treeEntries,
    }),
  });

  const commit = await github('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [headSha],
    }),
  });

  await github(`/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: commit.sha,
      force: false,
    }),
  });

  return commit;
}

export async function saveEditableArticle(id, patch) {
  const located = await findArticle(id);
  if (!located.article) return null;

  const updatedArticle = applyArticlePatch(located.article, patch);
  located.file.data[located.index] = updatedArticle;

  const updates = [
    {
      path: located.file.path,
      text: `${JSON.stringify(located.file.data, null, 2)}\n`,
    },
  ];

  const searchFile = await readJsonFile(SEARCH_FILE);
  const searchIndex = searchFile.data.findIndex((article) => article?.id === id);
  if (searchIndex !== -1) {
    searchFile.data[searchIndex] = applyArticlePatch(searchFile.data[searchIndex], patch);
    updates.push({
      path: SEARCH_FILE,
      text: `${JSON.stringify(searchFile.data, null, 2)}\n`,
    });
  }

  const commit = await commitFiles(
    updates,
    `Edit Compute Current article ${id}\n\nUpdated through the private admin editor.\n\nConfidence: high\nScope-risk: narrow\nTested: Admin editor payload validation`,
  );

  return {
    article: updatedArticle,
    sourceFile: located.file.path,
    commitSha: commit.sha,
    commitUrl: commit.html_url,
  };
}
