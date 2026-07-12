import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeAdminAction, json, requireAdmin } from './_auth.js';
import { adminError } from './_request.js';
import {
  buildAdminDashboardModel,
  filterAdminArticleRows,
  parseAdminArticleFilters,
} from '../../scripts/lib/admin-dashboard-model.mjs';
import { getAdminCmsService } from './_storage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = path.join(ROOT, 'src/data');

function readData(name, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  } catch {
    return fallback;
  }
}

function loadDashboardModel(articles) {
  return buildAdminDashboardModel({
    latestNews: articles,
    archivedNews: [],
    editorialCycles: readData('editorial-cycles.json'),
    claimLedger: readData('claim-ledger.json'),
    sourceHealth: readData('source-health.json'),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    return;
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  try {
    authorizeAdminAction(session, 'article:read');
    const url = new URL(req.url || '/', 'https://admin.local');
    const filters = parseAdminArticleFilters(url.searchParams);
    const includeDeleted = session.role === 'admin';
    if (includeDeleted) authorizeAdminAction(session, 'admin:read-deleted');
    const storageArticles = await (await getAdminCmsService()).listArticles({ includeDeleted, limit: 2000 });
    const dashboard = loadDashboardModel(storageArticles);
    const articles = filterAdminArticleRows(dashboard.articles, filters).slice(0, 100);
    const { articles: _allArticles, ...dashboardSummary } = dashboard;

    json(res, 200, {
      ok: true,
      user: session.sub,
      filters,
      dashboard: dashboardSummary,
      articles,
    });
  } catch (error) {
    adminError(res, error);
  }
}
