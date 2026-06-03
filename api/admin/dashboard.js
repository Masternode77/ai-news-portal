import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { json, requireAdmin } from './_auth.js';
import {
  buildAdminDashboardModel,
  filterAdminArticleRows,
  parseAdminArticleFilters,
} from '../../scripts/lib/admin-dashboard-model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = path.join(ROOT, 'src/data');

function readData(name, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  } catch {
    return fallback;
  }
}

function loadDashboardModel() {
  return buildAdminDashboardModel({
    latestNews: readData('latest-news.json'),
    archivedNews: readData('archived-news.json'),
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

  const session = requireAdmin(req, res);
  if (!session) return;

  const url = new URL(req.url || '/', 'https://admin.local');
  const filters = parseAdminArticleFilters(url.searchParams);
  const dashboard = loadDashboardModel();
  const articles = filterAdminArticleRows(dashboard.articles, filters).slice(0, 100);
  const { articles: _allArticles, ...dashboardSummary } = dashboard;

  json(res, 200, {
    ok: true,
    user: session.sub,
    filters,
    dashboard: dashboardSummary,
    articles,
  });
}
