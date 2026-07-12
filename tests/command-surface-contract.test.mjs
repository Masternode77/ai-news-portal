import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = fs.readFileSync(new URL('../.github/workflows/update-news.yml', import.meta.url), 'utf8');
const canonicalScript = fs.readFileSync(new URL('../scripts/content-command-surface.mjs', import.meta.url), 'utf8');
const legacyPipeline = fs.readFileSync(new URL('../scripts/pipeline.mjs', import.meta.url), 'utf8');
const legacyMigration = fs.readFileSync(new URL('../scripts/migrate-legacy-content.mjs', import.meta.url), 'utf8');
const autonomousMigration = fs.readFileSync(new URL('../scripts/migrate-autonomous-editorial-desk-v1.mjs', import.meta.url), 'utf8');
const legacyGenerationScripts = [
  'humanize-existing-articles.mjs',
  'regenerate-clean-content.mjs',
  'regenerate-blog-surface-v4.mjs',
  'backfill-homepage-blogs.mjs',
  'regenerate-narrative-dna-articles.mjs',
  'regenerate-public-content-v2.mjs',
  'regenerate-latest100.mjs',
  'run-editorial-cycle.mjs',
  'regenerate-autonomous-analyses-v1.mjs',
  'regenerate-public-feed.mjs',
  'regenerate-longform-analysis.mjs',
  'regenerate-brief-cards.mjs',
  'run-content-cycle.mjs',
  'schedule-content-cycle.mjs',
  'emergency-cleanup-public-content.mjs',
  'quarantine-low-quality-content.mjs',
  'generate-missing-images.mjs',
];

const canonicalEntrypoint = 'node ./scripts/content-command-surface.mjs';
const contentCommands = [
  'content:ingest',
  'content:extract',
  'content:classify',
  'content:cluster',
  'content:generate',
  'content:review',
  'content:publish',
  'content:cycle',
  'content:eval',
];

test('package exposes the canonical content command surface', () => {
  for (const command of contentCommands) {
    assert.ok(pkg.scripts[command], `missing ${command}`);
    assert.match(pkg.scripts[command], /content-command-surface\.mjs/, `${command} must use canonical CLI`);
  }

  assert.ok(pkg.scripts.test, 'missing test command');
  assert.ok(pkg.scripts.build, 'missing build command');
  assert.ok(pkg.scripts['audit:public'], 'missing audit:public command');
  assert.ok(pkg.scripts['audit:production'], 'missing audit:production command');
  assert.match(pkg.scripts['audit:production'], /--skip-cache-purge/);
});

test('legacy pipeline npm script is a compatibility wrapper to canonical production cycle', () => {
  assert.equal(pkg.scripts.pipeline, `${canonicalEntrypoint} cycle --production`);
  assert.doesNotMatch(pkg.scripts['content:cycle'], /--fixture\s/);
  assert.doesNotMatch(pkg.scripts['content:cycle'], /\.cache\/content-cycle/);
});

test('canonical CLI is the shared phase entrypoint over the core orchestrator phase list', () => {
  assert.match(canonicalScript, /CONTENT_CYCLE_PHASES/);
  assert.match(canonicalScript, /CONTENT_PHASES/);
  assert.match(canonicalScript, /runCanonicalContentCommand/);
  assert.doesNotMatch(canonicalScript, /scripts\/pipeline\.mjs/);
  assert.match(canonicalScript, /scripts\/eval-article-generation\.mjs/);
});

test('isolated phase commands route through the resumable orchestrator', () => {
  const result = spawnSync(process.execPath, ['scripts/content-command-surface.mjs', 'extract'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      CONTENT_CYCLE_CHECKPOINT_PATH: `.cache/test-content-cycle-${process.pid}.json`,
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /content cycle checkpoint is missing/);
  assert.doesNotMatch(result.stderr, /isolated content phases are not implemented/);
  assert.equal(result.stdout, '');
});

test('legacy pipeline file is only a compatibility alias to the canonical engine', () => {
  assert.match(legacyPipeline, /runCanonicalContentCommand/);
  assert.doesNotMatch(legacyPipeline, /fetchNewsPool|attachExpertLens|syncArchiveArtifacts/);
  assert.ok(legacyPipeline.split('\n').length < 20);
});

test('legacy generation entrypoints cannot execute independent writer implementations', () => {
  for (const file of legacyGenerationScripts) {
    const source = fs.readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    assert.match(source, /runLegacyContentCommand/, `${file} must delegate to the canonical engine`);
    assert.ok(source.split('\n').length < 10, `${file} must remain a thin compatibility wrapper`);
    assert.doesNotMatch(source, /writeJsonFile|writeFile|syncArchiveArtifacts|attachExpertLens/);
  }
});

test('retired runtime writers are removed or isolated to test helpers', () => {
  assert.equal(
    fs.existsSync(new URL('../scripts/lib/public-feed-regenerator.mjs', import.meta.url)),
    false,
    'independent public feed writer must be deleted',
  );

  const runtimeSources = fs.readdirSync(new URL('../scripts', import.meta.url), { recursive: true })
    .filter((file) => String(file).endsWith('.mjs'))
    .map((file) => ({
      file: String(file),
      source: fs.readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8'),
    }));
  for (const { file, source } of runtimeSources) {
    assert.doesNotMatch(
      source,
      /tests\/helpers\/content-cycle-fixture|\.\.\/tests\/helpers\/content-cycle-fixture/,
      `${file} must not execute the retired fixture engine`,
    );
  }
});

test('legacy migration diagnostics cannot mutate the public read model', () => {
  assert.doesNotMatch(legacyMigration, /writeJsonFile|applyWrites|SEARCH_INDEX_PATH|TAXONOMY_PAGES_PATH/);
  assert.doesNotMatch(autonomousMigration, /writeJsonFile/);
  assert.match(legacyMigration, /apply mode is disabled/i);
  assert.match(autonomousMigration, /diagnostic/i);
});

test('canonical CLI help remains successful', () => {
  const result = spawnSync(process.execPath, ['scripts/content-command-surface.mjs', '--help'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: node scripts\/content-command-surface\.mjs/);
  assert.equal(result.stderr, '');
});

test('cycle requires an explicit production boundary', () => {
  const result = spawnSync(process.execPath, ['scripts/content-command-surface.mjs', 'cycle'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires exactly one argument: --production/);
  assert.equal(result.stdout, '');
});

test('cycle rejects legacy fixture arguments instead of discarding them into production', () => {
  const direct = spawnSync(
    process.execPath,
    ['scripts/content-command-surface.mjs', 'cycle', '--production', '--fixture', 'tests/fixtures/content-cycle-mixed.json'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /requires exactly one argument: --production/);

  const throughNpm = spawnSync(
    'npm',
    ['run', 'content:cycle', '--', '--fixture', 'tests/fixtures/content-cycle-mixed.json'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  assert.notEqual(throughNpm.status, 0);
  assert.match(`${throughNpm.stdout}\n${throughNpm.stderr}`, /requires exactly one argument: --production/);
});

test('production workflow uses canonical cycle and reserves skip ci for dashboard-only commits', () => {
  assert.match(workflow, /run:\s+npm run content:cycle/);
  assert.doesNotMatch(workflow, /run:\s+npm run pipeline/);
  assert.match(workflow, /changed_files="\$\(git diff --cached --name-only\)"/);
  assert.match(workflow, /refresh news surface and archive"/);
  assert.match(workflow, /refresh dashboard state \[skip ci\]"/);
});
