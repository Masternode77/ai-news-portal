import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const repositoryNodeVersion = fs.readFileSync('.nvmrc', 'utf8').trim();

test('release workflow starts only after successful application validation or explicit manual dispatch', () => {
  assert.match(workflow, /^  workflow_run:\n    workflows:\n      - Application Validation\n    types:\n      - completed\n    branches:\n      - main$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow, /github\.event\.workflow_run\.actor\.login/);
  assert.match(workflow, /\[skip release\]/);
  assert.match(workflow, /REQUESTED_BUMP: \$\{\{ inputs\.bump \|\| 'patch' \}\}/);
  assert.match(workflow, /patch\|minor\|major/);
});

test('automatic releases structurally exclude content-only publication commits', () => {
  assert.match(workflow, /git diff --name-only HEAD\^ HEAD/);
  for (const contentPath of [
    'src/data/*',
    'public/generated/*',
    'config/codex-image-manifest.json',
    'scripts/state/pipeline-state.json',
    'docs/admin-exclusion-report.md',
    'docs/omo-ultra-audit.md',
    'docs/rendered-public-output-report.md',
    'docs/taxonomy-pages-report.md',
  ]) {
    assert.ok(workflow.includes(contentPath), `missing content-only path: ${contentPath}`);
  }
  assert.match(workflow, /application_change=false/);
  assert.match(workflow, /\*\)\n\s+application_change=true/);
  assert.match(workflow, /echo "eligible=\$\{application_change\}"/);
  assert.doesNotMatch(workflow, /chore: refresh news surface|chore: refresh public infrastructure/);
});

test('the workflow classifier executes correctly for real content, application, mixed and manual Git changes', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-eligibility-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Scheduled Mac Operator');
  git('config', 'user.email', 'fixture@example.invalid');
  const commit = (files, message = 'Update site') => {
    for (const filename of files) {
      fs.mkdirSync(path.dirname(path.join(cwd, filename)), { recursive: true });
      fs.appendFileSync(path.join(cwd, filename), 'change\n');
    }
    git('add', '.'); git('commit', '-m', message);
  };
  commit(['README.md'], 'baseline');
  const section = workflow.split('      - name: Determine release eligibility\n')[1].split('\n      - name: Confirm the validated commit')[0];
  const script = section.split('        run: |\n')[1].split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
  const outputFile = path.join(cwd, '.git', 'eligibility-output');
  const eligible = (event = 'workflow_run') => {
    fs.writeFileSync(outputFile, '');
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd, env: { ...process.env, EVENT_NAME: event, GITHUB_OUTPUT: outputFile }, stdio: 'pipe' });
    return fs.readFileSync(outputFile, 'utf8').trim();
  };
  commit(['src/data/latest-news.json', 'public/generated/article with spaces/hero.webp', 'config/codex-image-manifest.json']);
  assert.equal(eligible(), 'eligible=false');
  assert.equal(eligible('workflow_dispatch'), 'eligible=true');
  commit(['src/pages/index.astro']);
  assert.equal(eligible(), 'eligible=true');
  commit(['src/data/authored-columns.json', 'api/admin/login.js']);
  assert.equal(eligible(), 'eligible=true');
  commit(['package.json'], 'chore: release fixture [skip release]');
  assert.equal(eligible(), 'eligible=false');
});

test('release workflow checks out the validated commit and confirms main did not advance before versioning', () => {
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| 'main' \}\}/);
  const checkIndex = workflow.indexOf('git fetch origin main');
  const versionIndex = workflow.indexOf('npm version "$REQUESTED_BUMP" --no-git-tag-version');

  assert.ok(checkIndex > -1);
  assert.ok(versionIndex > checkIndex);
  assert.match(workflow, /origin\/main/);
  assert.match(workflow, /Validated commit is no longer the main head/);
  assert.match(workflow, /git add package\.json package-lock\.json/);
  assert.match(workflow, /git commit -m "chore: release \$\{TAG\} \[skip release\]"/);
});

test('manual releases run the same application gates before versioning', () => {
  const commands = [
    'npm audit --omit=dev --audit-level=high',
    'npm run check',
    'PIPELINE_OFFLINE=0 npm test',
    'npm run content:gate:built',
    'npm version "$REQUESTED_BUMP" --no-git-tag-version',
  ];
  const positions = commands.map((command) => workflow.indexOf(command));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
});

test('release workflow serializes main writes and publishes one atomic tag and GitHub release', () => {
  assert.match(workflow, /^  contents: write$/m);
  assert.match(workflow, /^  group: ai-news-portal-main-writes$/m);
  assert.match(workflow, /^  cancel-in-progress: false$/m);
  assert.match(workflow, /git push --atomic origin HEAD:main "refs\/tags\/\$\{TAG\}"/);
  assert.match(workflow, /gh release create "\$TAG" --verify-tag --generate-notes/);
});

test('release workflow pins its actions and uses the repository Node runtime', () => {
  const actionRefs = [...workflow.matchAll(/^\s+uses:\s*(?<action>actions\/(?:checkout|setup-node))@(?<ref>\S+)(?:\s+#\s*(?<major>v\d+))?\s*$/gm)];
  const configuredNodeVersion = workflow.match(/^\s+node-version:\s*['"](?<version>[^'"]+)['"]\s*$/m);

  assert.deepEqual(
    actionRefs.map(({ groups }) => [groups.action, groups.ref]),
    [
      ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
      ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
    ],
  );
  assert.ok(actionRefs.every(({ groups }) => /^[0-9a-f]{40}$/.test(groups.ref) && groups.major === 'v4'));
  assert.equal(configuredNodeVersion?.groups?.version, repositoryNodeVersion);
});

test('operator documentation distinguishes product releases from automated news refreshes', () => {
  assert.match(readme, /## Release versioning/);
  assert.match(readme, /semantic\s+patch\s+version/i);
  assert.match(readme, /automated news refresh commits do not create releases/i);
  assert.match(readme, /content-only paths/i);
  assert.match(readme, /exact Git commit SHA/i);
});
