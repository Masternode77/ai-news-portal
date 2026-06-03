import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  applyLegacyMigrationPlan,
  buildLegacyMigrationPlan,
  classifyLegacyArticle,
} from '../scripts/lib/legacy-migration.mjs';

function fixtures() {
  const cleanNetApp = `${'NetApp and Red Hat OpenShift backup, storage, disaster recovery, and platform operations affect enterprise AI infrastructure readiness. '.repeat(18)}Final sentence complete.`;
  const landExpand = `${'Data Center Frontier described AI infrastructure expansion across land, power, capital, chips, and customer demand. '.repeat(8)}Final sentence complete.`;
  return [
    {
      id: 'netapp-openshift',
      title: 'NetApp Expands OpenShift Data Management With Faster VM Backup, DR, and Cloud Scale Support',
      source: 'StorageReview',
      sourceUrl: 'https://example.com/netapp',
      infrastructure_relevance_score: 0.88,
      extraction_quality_score: 0.92,
      articleText: cleanNetApp,
      generatedImage: '/generated/articles/netapp/hero.webp',
    },
    {
      id: 'app-store-ai',
      title: 'Apple App Store AI game assistant adds avatars',
      source: 'App Store News',
      sourceUrl: 'https://example.com/app-store-ai',
      infrastructure_relevance_score: 0.25,
      extraction_quality_score: 0.91,
      articleText: `${'A consumer app store AI gaming feature update focuses on avatars, mobile games, and shoppers. '.repeat(10)}Final sentence complete.`,
    },
    {
      id: 'land-expand',
      title: 'Land and Expand: NVIDIA, IREN, Coatue, Microsoft, Switch, Cerebras, Core Scientific',
      source: 'Data Center Frontier',
      sourceUrl: 'https://example.com/land-expand',
      infrastructure_relevance_score: 0.73,
      extraction_quality_score: 0.86,
      articleText: landExpand,
    },
    {
      id: 'missing-image',
      title: 'Cooling supplier expands CDU capacity for AI racks',
      source: 'Thermal News',
      sourceUrl: 'https://example.com/cdu',
      infrastructure_relevance_score: 0.79,
      extraction_quality_score: 0.88,
      articleText: `${'Cooling suppliers added capacity for high density AI rack deployments and operators need delivery timing. '.repeat(10)}Final sentence complete.`,
    },
    {
      id: 'clipped-3d-printer',
      title: 'Consumer 3D printer gets AI mascot mode',
      source: '',
      infrastructure_relevance_score: 0.12,
      extraction_quality_score: 0.1,
      articleText: 'The consumer gadget story ended in the middle of a senten',
    },
  ];
}

test('legacy migration classifier covers required actions and named examples', () => {
  const actions = new Map(fixtures().map((article) => [article.id, classifyLegacyArticle(article).action]));

  assert.equal(actions.get('netapp-openshift'), 'regenerate_longform');
  assert.equal(actions.get('app-store-ai'), 'hidden_noindex');
  assert.equal(actions.get('land-expand'), 'regenerate_brief');
  assert.equal(actions.get('missing-image'), 'assign_fallback_image');
  assert.equal(actions.get('clipped-3d-printer'), 'delete_or_410');
});

test('legacy migration plan updates public artifacts without deleting records', () => {
  const plan = buildLegacyMigrationPlan(fixtures(), { auditLimit: 200, regenerationLimit: 100 });
  assert.deepEqual(Object.keys(plan.counts).sort(), [
    'assign_fallback_image',
    'delete_or_410',
    'hidden_noindex',
    'regenerate_brief',
    'regenerate_longform',
  ]);
  assert.equal(plan.examples.NetApp.action, 'regenerate_longform');
  assert.equal(plan.examples.AppStoreAI.action, 'hidden_noindex');
  assert.equal(plan.examples.LandAndExpand.action, 'regenerate_brief');

  const applied = applyLegacyMigrationPlan(plan);
  assert.equal(applied.updatedArticles.length, fixtures().length);
  assert.equal(applied.rollback.length, fixtures().length);
  assert.equal(applied.updatedArticles.find((article) => article.id === 'clipped-3d-printer').public_status, 'gone');
  assert.ok(applied.updatedArticles.find((article) => article.id === 'missing-image').heroImage?.includes('/generated/fallbacks/'));
  assert.ok(applied.searchIndex.every((article) => article.id !== 'app-store-ai'));
  assert.ok(applied.cacheReport.updatedArtifacts.includes('sitemapEntries'));
});

test('legacy migration apply preserves rows outside the audit limit', () => {
  const rows = fixtures();
  const plan = buildLegacyMigrationPlan(rows, { auditLimit: 1, regenerationLimit: 10 });
  const applied = applyLegacyMigrationPlan(plan);

  assert.equal(plan.classifications.length, 1);
  assert.equal(applied.updatedArticles.length, rows.length);
  assert.equal(applied.rollback.length, rows.length);

  const updatedIds = new Set(applied.updatedArticles.map((article) => article.id));
  const rollbackIds = new Set(applied.rollback.map((entry) => entry.id));
  for (const row of rows) {
    assert.ok(updatedIds.has(row.id));
    assert.ok(rollbackIds.has(row.id));
  }

  for (const row of rows.slice(1)) {
    assert.deepEqual(
      applied.updatedArticles.find((article) => article.id === row.id),
      row,
    );
  }
});

test('legacy migration empty plan preserves zero records', () => {
  const applied = applyLegacyMigrationPlan({ classifications: [], sourceArticles: [] });

  assert.deepEqual(applied.updatedArticles, []);
  assert.deepEqual(applied.rollback, []);
  assert.deepEqual(applied.searchIndex, []);
  assert.deepEqual(applied.rssItems, []);
  assert.equal(applied.sitemapEntries.some((entry) => entry.loc?.startsWith('/news/')), false);
});

test('migration package scripts are wired', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const script of ['migrate:legacy', 'regen:latest100', 'generate:missing-images', 'purge:cache']) {
    assert.equal(typeof pkg.scripts[script], 'string');
  }
});
