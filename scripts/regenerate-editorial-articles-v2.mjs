import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_LIMIT,
  LATEST_NEWS_PATH,
  SEARCH_INDEX_PATH,
} from './lib/constants.mjs';
import {
  EDITORIAL_ARTICLE_V2_VERSION,
  writeEditorialBlogArticleV2,
} from './lib/editorial-blog-writer-v2.mjs';
import { PUBLIC_INTERNAL_LABELS, quarantinePublicArticle } from './lib/public-publish-quality-gate.mjs';
import { applySourceScopePolicy } from './lib/source-scope-policy.mjs';
import { syncArchiveArtifacts } from './lib/archive-store.mjs';
import { forbiddenPublicPhraseMatches } from './lib/copy-quality-guard.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGEN_REPORT_PATH = path.join(ROOT, 'docs/editorial-article-v2-regeneration-report.md');
const AUDIT_REPORT_PATH = path.join(ROOT, 'docs/public-editorial-v2-audit-report.md');
const REGENERATE_LIMIT = Number(process.env.EDITORIAL_ARTICLE_V2_REGEN_LIMIT || 50);
const LEGACY_VERSION = 'autonomous_editorial_desk_v1';

function publishedTime(article = {}) {
  const time = new Date(article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeById(items = []) {
  const byId = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
  }
  return [...byId.values()].sort((a, b) => publishedTime(b) - publishedTime(a));
}

function publicText(article = {}) {
  return [
    article.title,
    article.deck,
    article.summary,
    article.snippet,
    article.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    article.expertLensFull?.finalArticleBody,
    article.article_body_markdown,
    article.articleText,
    article.bottom_line,
    article.expertLensFull?.bottomLine,
  ].filter(Boolean).join('\n\n');
}

function countInternalLabels(article = {}) {
  const text = publicText(article);
  return PUBLIC_INTERNAL_LABELS.reduce((sum, label) => {
    const flags = label === 'claim ledger' ? 'gi' : 'g';
    const pattern = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    return sum + (text.match(pattern) || []).length;
  }, 0);
}

function oldRoute(article = {}) {
  return article.public_route
    || article.public_routing?.routing_decision
    || article.public_routing?.laneTitle
    || article.publishing_route
    || article.article_type
    || 'n/a';
}

function oldLabel(article = {}) {
  return article.public_signal_label
    || article.public_routing?.public_signal_label
    || article.public_presentation?.signal_label
    || 'n/a';
}

function searchable(article = {}) {
  return {
    ...article,
    slug: article.slug || article.id,
    searchText: [
      article.title,
      article.source,
      article.category,
      article.primary_category,
      article.infrastructure_layer,
      article.deck,
      article.why_it_matters,
      article.article_body_markdown,
      article.expertLensFull?.finalArticleBody,
      article.articleText,
      ...(article.tags || []),
    ].filter(Boolean).join(' '),
  };
}

function quarantineForV2(article = {}, reasons = []) {
  const scoped = applySourceScopePolicy(article, article.public_routing || {});
  return quarantinePublicArticle({
    ...scoped,
    ...article,
    primary_category: scoped.primary_category,
    category: scoped.category,
    public_route: scoped.public_route,
    public_signal_label: scoped.public_signal_label,
    public_routing: scoped.public_routing,
    routing_decision: scoped.routing_decision,
    public_presentation: scoped.public_presentation,
    source_scope_policy: scoped.source_scope_policy,
    previous_generation_version: article.generation_version || article.public_generation_version || 'unknown',
    generation_version: EDITORIAL_ARTICLE_V2_VERSION,
    public_generation_version: EDITORIAL_ARTICLE_V2_VERSION,
    backfilledAnalysis: false,
  }, reasons);
}

function reportRow(row = {}) {
  return [
    row.title.replace(/\|/g, '/'),
    row.old_route,
    row.new_route,
    row.old_category,
    row.new_category,
    row.old_label,
    row.new_label,
    row.removed_debug_labels,
    row.forbidden_phrase_count,
    row.source_scope_violations.join('; ') || 'none',
    row.final_decision,
  ].join(' | ');
}

async function writeReports(rows = [], all = []) {
  const published = rows.filter((row) => row.final_decision === 'published').length;
  const quarantined = rows.filter((row) => row.final_decision === 'quarantined').length;
  const forbiddenTotal = rows.reduce((sum, row) => sum + row.forbidden_phrase_count, 0);
  const scopeViolations = rows.flatMap((row) => row.source_scope_violations);

  const regenLines = [
    '# Editorial Article v2 Regeneration Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Generation version: ${EDITORIAL_ARTICLE_V2_VERSION}`,
    `Processed newest records: ${rows.length}`,
    `Published after v2 gate: ${published}`,
    `Quarantined after v2 gate: ${quarantined}`,
    '',
    '| Title | Before route | After route | Before category | After category | Before label | After label | Removed debug labels | Forbidden phrase count | Source scope violations | Final decision |',
    '| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- |',
    ...rows.map((row) => `| ${reportRow(row)} |`),
    '',
    '## Cache purge',
    '',
    'Run `npm run purge:public-cache` after regeneration to purge Vercel/static caches. The command writes `docs/public-cache-purge-report.md` when credentials are available.',
  ];

  const auditLines = [
    '# Public Editorial v2 Audit Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Generation version: ${EDITORIAL_ARTICLE_V2_VERSION}`,
    `Records in store after merge: ${all.length}`,
    `Records generated by v2: ${all.filter((article) => article.generation_version === EDITORIAL_ARTICLE_V2_VERSION).length}`,
    `Visible article pages: ${all.filter((article) => article.articlePagePublished !== false && article.archiveOnly !== true && article.public_status !== 'quarantined').length}`,
    `Forbidden phrase count across processed rows: ${forbiddenTotal}`,
    `Source scope violations across processed rows: ${scopeViolations.length}`,
    '',
    '## Failures',
    '',
    scopeViolations.length ? scopeViolations.map((reason) => `- ${reason}`).join('\n') : '- None',
  ];

  await fs.mkdir(path.dirname(REGEN_REPORT_PATH), { recursive: true });
  await fs.writeFile(REGEN_REPORT_PATH, `${regenLines.join('\n')}\n`, 'utf8');
  await fs.writeFile(AUDIT_REPORT_PATH, `${auditLines.join('\n')}\n`, 'utf8');
}

export async function regenerateEditorialArticlesV2(options = {}) {
  const [latest, archive] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
  ]);
  const merged = mergeById([...latest, ...archive]);
  const selectedIds = new Set(merged.slice(0, options.limit || REGENERATE_LIMIT).map((article) => article.id));
  const rows = [];
  const recent = [];
  const out = [];

  for (const article of merged) {
    const before = {
      old_route: oldRoute(article),
      old_category: article.primary_category || article.category || 'n/a',
      old_label: oldLabel(article),
      debug_labels: countInternalLabels(article),
    };

    let next = { ...article };
    let finalDecision = article.public_status || 'unchanged';
    let gateReasons = [];

    if (selectedIds.has(article.id)) {
      const result = writeEditorialBlogArticleV2(article, {
        index: rows.length,
        recent,
      });
      if (result.ok) {
        next = result.article;
        finalDecision = 'published';
        recent.push(next);
      } else {
        next = quarantineForV2(result.article || article, result.reasons);
        finalDecision = 'quarantined';
        gateReasons = result.reasons;
      }
    } else if (article.generation_version === LEGACY_VERSION || article.public_generation_version === LEGACY_VERSION) {
      next = quarantineForV2(article, ['stale_autonomous_blog_writer_v1']);
      finalDecision = 'quarantined';
      gateReasons = ['stale_autonomous_blog_writer_v1'];
    }

    const forbidden = forbiddenPublicPhraseMatches(publicText(next));
    const gate = next.public_publish_quality_gate || {};
    rows.push(selectedIds.has(article.id) || gateReasons.includes('stale_autonomous_blog_writer_v1') ? {
      id: article.id,
      title: article.title || article.id,
      ...before,
      new_route: oldRoute(next),
      new_category: next.primary_category || next.category || 'n/a',
      new_label: oldLabel(next),
      removed_debug_labels: Math.max(0, before.debug_labels - countInternalLabels(next)),
      forbidden_phrase_count: forbidden.length + Number(gate.metrics?.forbidden_phrase_count || 0),
      source_scope_violations: [
        ...(gate.reasons || []),
        ...gateReasons,
      ].filter((reason) => /^source_scope|cloud_capacity_without/.test(reason)),
      final_decision: finalDecision,
    } : null);

    out.push(searchable(next));
  }

  const compactRows = rows.filter(Boolean);
  const { latest: nextLatest, archive: nextArchive } = await syncArchiveArtifacts(out, []);
  const latestOut = nextLatest
    .sort((a, b) => publishedTime(b) - publishedTime(a))
    .slice(0, LATEST_NEWS_LIMIT)
    .map(searchable);
  await writeJsonFile(LATEST_NEWS_PATH, latestOut);
  await writeJsonFile(ARCHIVE_NEWS_PATH, nextArchive.map(searchable));
  await writeJsonFile(SEARCH_INDEX_PATH, mergeById([...latestOut, ...nextArchive]).map(searchable));
  await writeReports(compactRows, mergeById([...latestOut, ...nextArchive]));

  return {
    ok: compactRows.every((row) => row.final_decision === 'published' || row.final_decision === 'quarantined'),
    processed: compactRows.length,
    published: compactRows.filter((row) => row.final_decision === 'published').length,
    quarantined: compactRows.filter((row) => row.final_decision === 'quarantined').length,
    rows: compactRows,
    reportPath: REGEN_REPORT_PATH,
    auditReportPath: AUDIT_REPORT_PATH,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await regenerateEditorialArticlesV2();
  console.log(`editorial article v2 processed: ${result.processed}`);
  console.log(`published: ${result.published}`);
  console.log(`quarantined: ${result.quarantined}`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
  console.log(`audit report: ${path.relative(ROOT, result.auditReportPath)}`);
}
