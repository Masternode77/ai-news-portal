import assert from 'node:assert/strict';
import test from 'node:test';
import { saveEditableArticle } from '../api/admin/_github.js';
import { canonicalAdminArticle } from './fixtures/admin-publication-integrity.mjs';

const COLUMNS_PATH = 'src/data/authored-columns.json';
const ARTICLE_PATH = 'src/data/latest-news.json';
const ARCHIVE_PATH = 'src/data/archived-news.json';
const SEARCH_PATH = 'src/data/search-index.json';
const AUDIT_PATH = 'src/data/admin-audit-log.json';
const REGISTRY_PATH = 'config/sourceRegistry.yml';

function registryYaml({ allowTextUse = true, reviewedAt = '2026-08-09T00:00:00.000Z', id = 'authorized-test-source', domain = 'example.com' } = {}) {
  return `sources:\n  - id: ${id}\n    name: Authorized Test Source\n    domain: ${domain}\n    feed: https://${domain}/feed\n    status: active_feed\n    text_use_basis: licensed\n    image_use_basis: unreviewed\n    terms_url: https://${domain}/terms\n    reviewed_at: ${reviewedAt}\n    allow_text_use: ${allowTextUse}\n    allow_image_reuse: false\n`;
}

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, text: async () => payload === '' ? '' : JSON.stringify(payload) };
}

function article() {
  return {
    id: 'article-1',
    title: 'Original headline',
    summary: 'Original deck',
    public_status: 'draft',
    extraction_quality_score: 0.9,
    articleText: 'A utility filing describes a 300 MW data center campus, transformer delivery constraints, interconnection milestones, and phased energization dates for cloud operators. The source identifies the substation equipment and permitting work that must finish before the first accelerator hall can enter service.',
    expertLensFull: { finalHeadline: 'Original headline', finalArticleBody: 'A sufficiently detailed private draft body.', metaDescription: 'Original deck' },
  };
}

function githubFixture({ sourceSha = 'source-v1', auditStatus = 200, auditText, refUpdateStatus = 200, storedArticle = article(), registryStatus = 200, registryText = registryYaml() } = {}) {
  const calls = [];
  const files = new Map([
    [COLUMNS_PATH, { sha: 'columns-v1', data: [] }],
    [ARTICLE_PATH, { sha: sourceSha, data: [storedArticle] }],
    [ARCHIVE_PATH, { sha: 'archive-v1', data: [] }],
    [SEARCH_PATH, { sha: 'search-v1', data: [] }],
    [AUDIT_PATH, { sha: 'audit-v1', data: [{ action: 'existing-audit' }] }],
    [REGISTRY_PATH, { sha: 'registry-v1', text: registryText }],
  ]);
  let blob = 0;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const apiPath = parsed.pathname.replace('/repos/test/repo', '');
    calls.push({ path: apiPath, ref: parsed.searchParams.get('ref'), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (apiPath === '/git/ref/heads/main') return response(200, { object: { sha: 'head-v1' } });
    if (apiPath === '/git/commits/head-v1') return response(200, { tree: { sha: 'tree-v1' } });
    if (apiPath.startsWith('/contents/')) {
      const path = decodeURIComponent(apiPath.slice('/contents/'.length));
      if (path === AUDIT_PATH && auditStatus !== 200) return response(auditStatus, { message: 'audit read failed' });
      if (path === REGISTRY_PATH && registryStatus !== 200) return response(registryStatus, { message: 'registry read failed' });
      const file = files.get(path);
      if (!file) return response(404, { message: 'Not Found' });
      const text = path === AUDIT_PATH && auditText !== undefined ? auditText : file.text ?? JSON.stringify(file.data);
      return response(200, { sha: file.sha, content: Buffer.from(text).toString('base64') });
    }
    if (apiPath === '/git/blobs' && options.method === 'POST') return response(201, { sha: `blob-${++blob}` });
    if (apiPath === '/git/trees' && options.method === 'POST') return response(201, { sha: 'tree-new' });
    if (apiPath === '/git/commits' && options.method === 'POST') return response(201, { sha: 'commit-new', html_url: 'https://github.test/commit-new' });
    if (apiPath === '/git/refs/heads/main' && options.method === 'PATCH') return response(refUpdateStatus, refUpdateStatus === 200 ? { object: { sha: 'commit-new' } } : { message: 'Reference update failed' });
    throw new Error(`Unexpected GitHub request: ${options.method || 'GET'} ${apiPath}`);
  };
  return calls;
}

function configureGithub() {
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPO = 'test/repo';
  process.env.GITHUB_BRANCH = 'main';
}

test.afterEach(() => {
  delete global.fetch;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPO;
  delete process.env.GITHUB_BRANCH;
});

test('stale source SHA fails with an explicit conflict before any GitHub write', async () => {
  // Given: the server reads a newer source blob than the editor version.
  configureGithub();
  const calls = githubFixture({ sourceSha: 'source-v2' });

  // When: the stale editor attempts to save.
  await assert.rejects(
    saveEditableArticle('article-1', { action: 'save-draft', title: 'Stale edit' }, { actor: 'owner', expectedSourceSha: 'source-v1' }),
    (error) => error?.statusCode === 409,
  );

  // Then: no mutating request reached GitHub.
  assert.equal(calls.some((call) => call.method !== 'GET'), false);
});

test('corrupt audit JSON fails closed without writing article or audit history', async () => {
  // Given: GitHub returns malformed JSON for the existing audit document.
  configureGithub();
  const calls = githubFixture({ auditText: '{corrupt' });

  // When: a valid editor save is attempted.
  await assert.rejects(saveEditableArticle('article-1', { action: 'save-draft', title: 'Valid edit' }, { actor: 'owner', expectedSourceSha: 'source-v1' }));

  // Then: the transaction creates no blobs, tree, commit, or ref update.
  assert.equal(calls.some((call) => call.method !== 'GET'), false);
});

test('audit transport 500 fails closed without writing article or audit history', async () => {
  // Given: the optional audit document endpoint fails with a server error.
  configureGithub();
  const calls = githubFixture({ auditStatus: 500 });

  // When: a valid editor save is attempted.
  await assert.rejects(saveEditableArticle('article-1', { action: 'save-draft', title: 'Valid edit' }, { actor: 'owner', expectedSourceSha: 'source-v1' }));

  // Then: no write is attempted.
  assert.equal(calls.some((call) => call.method !== 'GET'), false);
});

test('audit authentication failure does not masquerade as an absent document', async () => {
  // Given: GitHub rejects access to the audit document.
  configureGithub();
  const calls = githubFixture({ auditStatus: 401 });

  // When: a valid editor save is attempted.
  await assert.rejects(saveEditableArticle('article-1', { action: 'save-draft', title: 'Valid edit' }, { actor: 'owner', expectedSourceSha: 'source-v1' }));

  // Then: no replacement audit document or content write is created.
  assert.equal(calls.some((call) => call.method !== 'GET'), false);
});

test('concurrent branch writer returns conflict instead of claiming a successful save', async () => {
  // Given: all reads succeed but GitHub rejects the compare-and-swap ref update.
  configureGithub();
  githubFixture({ refUpdateStatus: 422 });

  // When/Then: the transaction surfaces a typed conflict.
  await assert.rejects(
    saveEditableArticle('article-1', { action: 'save-draft', title: 'Concurrent edit' }, { actor: 'owner', expectedSourceSha: 'source-v1' }),
    (error) => error?.statusCode === 409,
  );
});

test('typed audit 404 is the only absent-document fallback and preserves valid save behavior', async () => {
  // Given: the audit file genuinely does not exist.
  configureGithub();
  const calls = githubFixture({ auditStatus: 404 });

  // When: the current editor version is saved.
  const result = await saveEditableArticle('article-1', { action: 'save-draft', title: 'Current edit' }, { actor: 'owner', expectedSourceSha: 'source-v1' });

  // Then: one atomic commit includes article, search index, and a newly-created audit log.
  assert.equal(result.commitSha, 'commit-new');
  assert.equal(result.article.title, 'Current edit');
  const treeCall = calls.find((call) => call.path === '/git/trees' && call.method === 'POST');
  assert.equal(treeCall.body.tree.length, 3);
});

test('valid save appends to existing audit history in the same atomic commit', async () => {
  // Given: a current source version and an existing audit record.
  configureGithub();
  const calls = githubFixture();

  // When: the current editor version is saved.
  await saveEditableArticle('article-1', { action: 'save-draft', title: 'Audited edit' }, { actor: 'owner', expectedSourceSha: 'source-v1' });

  // Then: the audit blob retains the old record and appends this action.
  const blobCalls = calls.filter((call) => call.path === '/git/blobs' && call.method === 'POST');
  const audit = JSON.parse(blobCalls[2].body.content);
  assert.equal(audit.length, 2);
  assert.equal(audit[0].action, 'existing-audit');
  assert.equal(audit[1].action, 'save-draft');
});

test('persisted audit blob records the base commit while the API result reports the resulting commit', async () => {
  // Given: a current source version and an existing audit document at head-v1.
  configureGithub();
  const calls = githubFixture();

  // When: the editor persists a valid save through the GitHub CAS boundary.
  const result = await saveEditableArticle('article-1', { action: 'save-draft', title: 'Provenance edit' }, { actor: 'owner', expectedSourceSha: 'source-v1' });

  // Then: the exact audit blob names its truthful base, while the result names the new commit.
  const blobCalls = calls.filter((call) => call.path === '/git/blobs' && call.method === 'POST');
  const persistedAudit = JSON.parse(blobCalls[2].body.content);
  const persistedEntry = persistedAudit.at(-1);
  assert.equal(persistedEntry.baseCommitSha, 'head-v1');
  assert.equal(Object.hasOwn(persistedEntry, 'commitSha'), false);
  assert.equal(result.auditEntry.baseCommitSha, persistedEntry.baseCommitSha);
  assert.equal(Object.hasOwn(result.auditEntry, 'commitSha'), false);
  assert.equal(result.commitSha, 'commit-new');
  assert.notEqual(result.commitSha, persistedEntry.baseCommitSha);
});

test('failed public integrity stops publish and supported alternate actions before search sync or commit', async () => {
  // Given: current source content that lacks immutable publication evidence.
  for (const action of ['publish', 'upload-image']) {
    configureGithub();
    const calls = githubFixture({
      storedArticle: {
        ...article(),
        public_status: action === 'publish' ? 'draft' : 'published',
        articlePagePublished: action !== 'publish',
        homepagePublished: action !== 'publish',
      },
    });

    // When: either public-write path reaches the canonical boundary.
    const result = await saveEditableArticle('article-1', { action, replacementImage: '/uploads/new.webp' }, { actor: 'owner', expectedSourceSha: 'source-v1' });

    // Then: it blocks before search/audit reads and before every GitHub mutation.
    assert.equal(result.blocked, true, action);
    assert.equal(calls.some((call) => call.path.includes(SEARCH_PATH)), false, action);
    assert.equal(calls.some((call) => call.path.includes(AUDIT_PATH)), false, action);
    assert.equal(calls.some((call) => call.method !== 'GET'), false, action);
  }
});

test('unregistered source authorization blocks admin publish before any Git mutation', async () => {
  // Given: a publication-ready draft whose example.com source is absent from the production registry.
  configureGithub();
  const calls = githubFixture({
    storedArticle: { ...canonicalAdminArticle(), id: 'article-1' },
    registryText: registryYaml({ id: 'other-source', domain: 'other.example' }),
  });

  // When: the admin API attempts to publish it through the Git-backed store.
  const result = await saveEditableArticle('article-1', { action: 'publish' }, {
    actor: 'owner',
    expectedSourceSha: 'source-v1',
  });

  // Then: current source rights fail before search/audit reads, blob creation, commit, or ref update.
  assert.equal(result.blocked, true);
  assert.ok(result.qualityErrors.includes('source_rights:source_not_registered'), JSON.stringify(result.qualityErrors));
  assert.equal(calls.some((call) => call.path.includes(SEARCH_PATH)), false);
  assert.equal(calls.some((call) => call.path.includes(AUDIT_PATH)), false);
  assert.equal(calls.some((call) => call.method !== 'GET'), false);
});

test('admin publication uses the exact remote-head registry snapshot and revocation blocks every Git mutation', async () => {
  // Given: the same deploy handles an authorized remote head and then a head where rights are revoked.
  configureGithub();
  const storedArticle = { ...canonicalAdminArticle(), id: 'article-1' };
  const authorizedCalls = githubFixture({ storedArticle, registryText: registryYaml({ allowTextUse: true }) });

  // When: publication is authorized by the registry blob at head-v1.
  const authorized = await saveEditableArticle('article-1', { action: 'publish' }, {
    actor: 'owner',
    expectedSourceSha: 'source-v1',
  });

  // Then: the persisted snapshot is bound to the exact registry blob used by the CAS transaction.
  assert.equal(authorized.commitSha, 'commit-new');
  assert.equal(authorized.article.publication_integrity.source_text_authorization.registryBlobSha, 'registry-v1');
  assert.ok(authorizedCalls.some((call) => call.path.includes(REGISTRY_PATH) && call.ref === 'head-v1'));
  const authorizedAudit = JSON.parse(authorizedCalls.filter((call) => call.path === '/git/blobs' && call.method === 'POST')[2].body.content).at(-1);
  assert.equal(authorizedAudit.sourceRegistrySha, 'registry-v1');
  assert.equal(typeof authorizedAudit.sourceRegistryDigest, 'string');

  const revokedCalls = githubFixture({ storedArticle, registryText: registryYaml({ allowTextUse: false }) });

  // When: the exact remote head revokes the same source.
  const revoked = await saveEditableArticle('article-1', { action: 'publish' }, {
    actor: 'owner',
    expectedSourceSha: 'source-v1',
  });

  // Then: revocation blocks before search/audit reads and before blobs, tree, commit, or ref mutation.
  assert.equal(revoked.blocked, true);
  assert.ok(revoked.qualityErrors.includes('source_rights:authorization_disabled'));
  assert.ok(revokedCalls.some((call) => call.path.includes(REGISTRY_PATH) && call.ref === 'head-v1'));
  assert.equal(revokedCalls.some((call) => call.path.includes(SEARCH_PATH)), false);
  assert.equal(revokedCalls.some((call) => call.path.includes(AUDIT_PATH)), false);
  assert.equal(revokedCalls.some((call) => call.method !== 'GET'), false);
});

test('missing malformed and unreadable head registries reject before search audit or Git mutation', async () => {
  // Given: the exact head registry is absent, malformed, or unreadable.
  const failures = [
    { registryStatus: 404 },
    { registryText: 'sources:\n  - id: broken\n' },
    { registryStatus: 500 },
  ];

  for (const failure of failures) {
    configureGithub();
    const calls = githubFixture({ storedArticle: { ...canonicalAdminArticle(), id: 'article-1' }, ...failure });

    // When: a publish mutation tries to bind itself to that head.
    await assert.rejects(saveEditableArticle('article-1', { action: 'publish' }, {
      actor: 'owner',
      expectedSourceSha: 'source-v1',
    }));

    // Then: no derived document is read and no Git write occurs.
    assert.equal(calls.some((call) => call.path.includes(SEARCH_PATH)), false);
    assert.equal(calls.some((call) => call.path.includes(AUDIT_PATH)), false);
    assert.equal(calls.some((call) => call.method !== 'GET'), false);
  }
});

test('unconsumed regeneration actions are rejected before search sync or commit', async () => {
  // Given: a current draft and no runtime consumer for regeneration requests.
  for (const action of ['regenerate-article', 'regenerate-brief', 'regenerate-image', 'edit-prompt']) {
    configureGithub();
    const calls = githubFixture();

    // When: a client submits a legacy regeneration action.
    const result = await saveEditableArticle('article-1', { action }, { actor: 'owner', expectedSourceSha: 'source-v1' });

    // Then: the server rejects it before search/audit synchronization or writes.
    assert.equal(result.blocked, true, action);
    assert.equal(result.statusCode, 400, action);
    assert.deepEqual(result.qualityErrors, ['unsupported_action'], action);
    assert.equal(calls.some((call) => call.path.includes(SEARCH_PATH)), false, action);
    assert.equal(calls.some((call) => call.path.includes(AUDIT_PATH)), false, action);
    assert.equal(calls.some((call) => call.method !== 'GET'), false, action);
  }
});
