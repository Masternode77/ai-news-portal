import { appendAdminAuditEntry } from '../../scripts/lib/admin-audit-log.mjs';
import { applyAdminArticleAction, syncAdminSearchIndex } from '../../scripts/lib/admin-article-store.mjs';

const DEFAULT_REPO = 'Masternode77/ai-news-portal';
const DATA_FILES = ['src/data/latest-news.json', 'src/data/archived-news.json'];
const SEARCH_FILE = 'src/data/search-index.json';
const AUDIT_FILE = 'src/data/admin-audit-log.json';

function githubConfig() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.COMPUTE_CURRENT_GITHUB_TOKEN || '';
  return { token, repo: process.env.GITHUB_REPO || DEFAULT_REPO, branch: process.env.GITHUB_BRANCH || 'main' };
}

async function github(path, options = {}) {
  const { token, repo } = githubConfig();
  if (!token) throw new Error('GitHub token is not configured. Set GITHUB_TOKEN with repo contents access.');
  const response = await fetch('https://api.github.com/repos/' + repo + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'User-Agent': 'compute-current-admin-editor',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || 'GitHub request failed with ' + response.status);
  return payload;
}

async function decodeContent(file) {
  if (file.content) return Buffer.from(file.content, 'base64').toString('utf8');
  const blob = await github('/git/blobs/' + file.sha);
  return Buffer.from(blob.content || '', 'base64').toString('utf8');
}

async function readJsonFile(path) {
  const { branch } = githubConfig();
  const file = await github('/contents/' + encodeURIComponent(path).replace(/%2F/g, '/') + '?ref=' + encodeURIComponent(branch));
  const text = await decodeContent(file);
  return { path, sha: file.sha, text, data: JSON.parse(text) };
}

async function readOptionalJsonFile(path, fallback) {
  try {
    return await readJsonFile(path);
  } catch {
    return { path, sha: '', text: JSON.stringify(fallback, null, 2) + '\n', data: fallback };
  }
}

async function findArticle(id) {
  const files = await Promise.all(DATA_FILES.map(readJsonFile));
  for (const file of files) {
    const index = file.data.findIndex((article) => article?.id === id);
    if (index !== -1) return { files, file, index, article: file.data[index] };
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
  const ref = await github('/git/ref/heads/' + encodeURIComponent(branch));
  const headSha = ref.object.sha;
  const headCommit = await github('/git/commits/' + headSha);
  const treeEntries = await Promise.all(updates.map(async (update) => {
    const blob = await github('/git/blobs', { method: 'POST', body: JSON.stringify({ content: update.text, encoding: 'utf-8' }) });
    return { path: update.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  const tree = await github('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: treeEntries }) });
  const commit = await github('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }) });
  await github('/git/refs/heads/' + encodeURIComponent(branch), { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  return commit;
}

export async function saveEditableArticle(id, patch, options = {}) {
  const located = await findArticle(id);
  if (!located.article) return null;
  const action = patch.action || options.action || 'save-draft';
  const actor = options.actor || 'admin';
  const actionResult = applyAdminArticleAction({ article: located.article, patch, action, actor });
  if (!actionResult.ok) return { ...actionResult, blocked: true, sourceFile: located.file.path };
  if (action === 'preview') {
    return { article: actionResult.article, auditEntry: actionResult.auditEntry, preview: actionResult.preview, sourceFile: located.file.path };
  }

  located.file.data[located.index] = actionResult.article;
  const updates = [{ path: located.file.path, text: JSON.stringify(located.file.data, null, 2) + '\n' }];
  const searchFile = await readJsonFile(SEARCH_FILE);
  updates.push({ path: SEARCH_FILE, text: JSON.stringify(syncAdminSearchIndex(searchFile.data, actionResult.article), null, 2) + '\n' });
  const auditFile = await readOptionalJsonFile(AUDIT_FILE, []);
  updates.push({ path: AUDIT_FILE, text: JSON.stringify(appendAdminAuditEntry(auditFile.data, actionResult.auditEntry), null, 2) + '\n' });

  const commit = await commitFiles(updates, 'Persist admin article action ' + action + ' for ' + id + '\n\nUpdated through the private admin editor.\n\nConfidence: high\nScope-risk: moderate\nTested: Admin article store and quality gates');
  return {
    article: actionResult.article,
    auditEntry: { ...actionResult.auditEntry, commitSha: commit.sha },
    sourceFile: located.file.path,
    commitSha: commit.sha,
    commitUrl: commit.html_url,
  };
}
