import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { json } from '../api/admin/_auth.js';
import { adminPublicDetailEligibility } from '../api/admin/article.js';
import { clearDashboardPrivateDom, clearEditorPrivateDom } from '../src/lib/admin-private-state.mjs';
import { buildAdminDashboardModel } from '../scripts/lib/admin-dashboard-model.mjs';
import { authorizedAdminSourceRegistry, canonicalAdminArticle } from './fixtures/admin-publication-integrity.mjs';

const NOW = '2026-08-10T00:00:00.000Z';

function privateElement() {
  return {
    resetCalls: 0,
    replaceChildrenCalls: 0,
    attributes: {},
    reset() { this.resetCalls += 1; },
    replaceChildren() { this.replaceChildrenCalls += 1; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

function privateDocument(ids) {
  const elements = Object.fromEntries(ids.map((id) => [id, privateElement()]));
  return { elements, getElementById(id) { return elements[id] || null; } };
}

test('dashboard queues retain the query-addressed editor shell as their only review destination', () => {
  const model = buildAdminDashboardModel({
    latestNews: [{ id: 'needs-review', title: 'Needs review', draft: true, extraction_failed: true }],
  });

  const queued = model.reviewQueues.failedExtraction.items[0];
  assert.equal(queued.editHref, '/admin/edit/?id=needs-review');
  assert.equal(queued.qualityHref, queued.editHref);
  assert.equal(fs.existsSync(new URL('../src/pages/admin/edit.astro', import.meta.url)), true);
});

test('canonical public-detail eligibility returns zero or mixed links without manufacturing stale public paths', () => {
  const options = { sourceRegistry: authorizedAdminSourceRegistry(), now: NOW };
  const eligible = adminPublicDetailEligibility(canonicalAdminArticle({ published: true }), options);
  const ineligible = adminPublicDetailEligibility(canonicalAdminArticle({ published: false }), options);

  assert.deepEqual(eligible, { eligible: true, href: '/news/canonical-admin-article/' });
  assert.deepEqual(ineligible, { eligible: false, href: '' });
  assert.deepEqual([ineligible].filter((detail) => detail.eligible), []);
  assert.deepEqual([eligible, ineligible].filter((detail) => detail.eligible).map((detail) => detail.href), ['/news/canonical-admin-article/']);
});

test('admin responses and static shells explicitly prohibit private caching', () => {
  const response = { headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, end() {} };
  json(response, 200, { ok: true });
  assert.equal(response.headers['cache-control'], 'no-store, private');
  assert.equal(response.headers.pragma, 'no-cache');

  for (const page of ['admin.astro', 'admin.html.astro', 'admin/dashboard.astro', 'admin/edit.astro']) {
    const source = fs.readFileSync(new URL('../src/pages/' + page, import.meta.url), 'utf8');
    assert.match(source, /Astro\.response\.headers\.set\('Cache-Control', 'no-store, private'\)/);
  }

  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const privateRules = vercel.headers.filter((rule) => String(rule.source).includes('admin'));
  assert.ok(privateRules.length >= 4);
  assert.ok(privateRules.every((rule) => rule.headers.some((header) => header.key === 'Cache-Control' && header.value === 'no-store, private')));
});

test('logout and session failure purge every private dashboard and editor DOM surface before login', () => {
  const dashboard = privateDocument(['article-filter-form', 'count-tiles', 'review-queues', 'article-table-body', 'admin-logs', 'status-filter', 'category-filter', 'source-filter']);
  clearDashboardPrivateDom(dashboard);
  assert.equal(dashboard.elements['article-filter-form'].resetCalls, 1);
  for (const id of ['count-tiles', 'review-queues', 'article-table-body', 'admin-logs', 'status-filter', 'category-filter', 'source-filter']) {
    assert.equal(dashboard.elements[id].replaceChildrenCalls, 1, id);
  }

  const editor = privateDocument(['article-form', 'article-meta', 'admin-preview', 'editor-title', 'article-context-link']);
  clearEditorPrivateDom(editor);
  assert.equal(editor.elements['article-form'].resetCalls, 1);
  for (const id of ['article-meta', 'admin-preview', 'editor-title']) assert.equal(editor.elements[id].replaceChildrenCalls, 1, id);
  assert.equal(editor.elements['article-context-link'].attributes.href, '/admin/dashboard/');
});
