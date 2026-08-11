import { appendAdminAuditEntry } from '../../scripts/lib/admin-audit-log.mjs';
import { applyAdminArticleAction, syncAdminSearchIndex } from '../../scripts/lib/admin-article-store.mjs';
import { parseSourceRegistryYaml } from '../../scripts/lib/source-registry.mjs';

const DEFAULT_REPO = 'Masternode77/ai-news-portal';
const DATA_FILES = ['src/data/latest-news.json', 'src/data/archived-news.json'];
const SEARCH_FILE = 'src/data/search-index.json';
const AUDIT_FILE = 'src/data/admin-audit-log.json';
const SOURCE_REGISTRY_FILE = 'config/sourceRegistry.yml';

export class GithubRequestError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'GithubRequestError';
    this.statusCode = statusCode;
  }
}

export class AdminWriteConflictError extends Error {
  constructor(message = 'Article changed since it was loaded. Reload and retry.') {
    super(message);
    this.name = 'AdminWriteConflictError';
    this.statusCode = 409;
  }
}

export class AdminVersionRequiredError extends Error {
  constructor() {
    super('Missing expected source version. Reload the article and retry.');
    this.name = 'AdminVersionRequiredError';
    this.statusCode = 400;
  }
}

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
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new GithubRequestError('GitHub returned malformed JSON.', response.status);
    }
  }
  if (!response.ok) throw new GithubRequestError(payload?.message || 'GitHub request failed with ' + response.status, response.status);
  return payload;
}

async function decodeContent(file) {
  if (file.content) return Buffer.from(file.content, 'base64').toString('utf8');
  const blob = await github('/git/blobs/' + file.sha);
  return Buffer.from(blob.content || '', 'base64').toString('utf8');
}

async function readJsonFile(path, ref) {
  const reference = ref || githubConfig().branch;
  const file = await github('/contents/' + encodeURIComponent(path).replace(/%2F/g, '/') + '?ref=' + encodeURIComponent(reference));
  const text = await decodeContent(file);
  return { path, sha: file.sha, text, data: JSON.parse(text) };
}

async function readSourceRegistry(ref) {
  const file = await github('/contents/' + encodeURIComponent(SOURCE_REGISTRY_FILE).replace(/%2F/g, '/') + '?ref=' + encodeURIComponent(ref));
  const text = await decodeContent(file);
  const sources = parseSourceRegistryYaml(text);
  const declaredIds = [...text.matchAll(/^\s*-\s+id:\s*([^\s#]+)\s*$/gm)].map((match) => match[1].toLowerCase());
  const sourceIds = sources.map((source) => String(source.id || '').trim().toLowerCase());
  const domains = sources.map((source) => String(source.domain || '').trim().toLowerCase().replace(/^www\./, ''));
  const malformed = !/^sources:\s*$/m.test(text)
    || declaredIds.length === 0
    || declaredIds.length !== sources.length
    || new Set(sourceIds).size !== sourceIds.length
    || new Set(domains).size !== domains.length
    || domains.some((domain) => !domain);
  if (malformed) throw new GithubRequestError('Source registry is malformed or contains duplicate entries.', 422);
  return {
    path: SOURCE_REGISTRY_FILE,
    sha: file.sha,
    sources: Object.freeze(sources.map((source) => Object.freeze({ ...source }))),
  };
}

async function readOptionalJsonFile(path, fallback, ref) {
  try {
    return await readJsonFile(path, ref);
  } catch (error) {
    if (!(error instanceof GithubRequestError) || error.statusCode !== 404) throw error;
    return { path, sha: '', text: JSON.stringify(fallback, null, 2) + '\n', data: fallback };
  }
}

async function findArticle(id, ref) {
  const files = await Promise.all(DATA_FILES.map((path) => readJsonFile(path, ref)));
  for (const file of files) {
    const index = file.data.findIndex((article) => article?.id === id);
    if (index !== -1) return { files, file, index, article: file.data[index] };
  }
  return { files, file: null, index: -1, article: null };
}

export async function getEditableArticle(id) {
  const { file, article } = await findArticle(id);
  if (!article) return null;
  return { article, sourceFile: file.path, sourceSha: file.sha };
}

async function commitFiles(updates, message, headSha) {
  const { branch } = githubConfig();
  const headCommit = await github('/git/commits/' + headSha);
  const treeEntries = await Promise.all(updates.map(async (update) => {
    const blob = await github('/git/blobs', { method: 'POST', body: JSON.stringify({ content: update.text, encoding: 'utf-8' }) });
    return { path: update.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  const tree = await github('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: treeEntries }) });
  const commit = await github('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }) });
  try {
    await github('/git/refs/heads/' + encodeURIComponent(branch), { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  } catch (error) {
    if (error instanceof GithubRequestError && (error.statusCode === 409 || error.statusCode === 422)) throw new AdminWriteConflictError();
    throw error;
  }
  return { ...commit, fileShas: Object.fromEntries(updates.map((update, index) => [update.path, treeEntries[index].sha])) };
}

export async function saveEditableArticle(id, patch, options = {}) {
  const expectedSourceSha = String(options.expectedSourceSha || '').trim();
  if (!expectedSourceSha) throw new AdminVersionRequiredError();
  const { branch } = githubConfig();
  const ref = await github('/git/ref/heads/' + encodeURIComponent(branch));
  const headSha = ref.object.sha;
  const [located, registryFile] = await Promise.all([
    findArticle(id, headSha),
    readSourceRegistry(headSha),
  ]);
  if (!located.article) return null;
  if (located.file.sha !== expectedSourceSha) throw new AdminWriteConflictError();
  const action = patch.action || options.action || 'save-draft';
  const actor = options.actor || 'admin';
  const recentRecords = located.files.flatMap((file) => file.data).filter((article) => article?.id !== id);
  const actionResult = applyAdminArticleAction({
    article: located.article,
    patch,
    action,
    actor,
    recentRecords,
    sourceRegistry: registryFile.sources,
    sourceRegistrySha: registryFile.sha,
  });
  if (!actionResult.ok) return { ...actionResult, blocked: true, sourceFile: located.file.path };
  if (action === 'preview') {
    return { article: actionResult.article, auditEntry: actionResult.auditEntry, preview: actionResult.preview, sourceFile: located.file.path, sourceSha: located.file.sha };
  }

  located.file.data[located.index] = actionResult.article;
  const updates = [{ path: located.file.path, text: JSON.stringify(located.file.data, null, 2) + '\n' }];
  const searchFile = await readJsonFile(SEARCH_FILE, headSha);
  updates.push({ path: SEARCH_FILE, text: JSON.stringify(syncAdminSearchIndex(searchFile.data, actionResult.article), null, 2) + '\n' });
  const auditFile = await readOptionalJsonFile(AUDIT_FILE, [], headSha);
  const sourceAuthorization = actionResult.article.publication_integrity?.source_text_authorization;
  const auditEntry = {
    ...actionResult.auditEntry,
    baseCommitSha: headSha,
    sourceRegistrySha: registryFile.sha,
    sourceRegistryDigest: sourceAuthorization?.registryDigest || '',
  };
  updates.push({ path: AUDIT_FILE, text: JSON.stringify(appendAdminAuditEntry(auditFile.data, auditEntry), null, 2) + '\n' });

  const commit = await commitFiles(updates, 'Persist admin article action ' + action + ' for ' + id + '\n\nUpdated through the private admin editor.\n\nConfidence: high\nScope-risk: moderate\nTested: Admin article store and quality gates', headSha);
  return {
    article: actionResult.article,
    auditEntry,
    sourceFile: located.file.path,
    sourceSha: commit.fileShas[located.file.path],
    commitSha: commit.sha,
    commitUrl: commit.html_url,
  };
}
