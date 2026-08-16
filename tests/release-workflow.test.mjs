import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const repositoryNodeVersion = fs.readFileSync('.nvmrc', 'utf8').trim();

test('release workflow automatically patches human-authored main changes without looping on bot commits', () => {
  assert.match(workflow, /^  push:\n    branches:\n      - main$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /!endsWith\(github\.actor, '\[bot\]'\)/);
  assert.match(workflow, /\[skip release\]/);
  assert.match(workflow, /REQUESTED_BUMP: \$\{\{ inputs\.bump \|\| 'patch' \}\}/);
  assert.match(workflow, /patch\|minor\|major/);
});

test('release workflow validates before changing the synchronized package versions', () => {
  const checkIndex = workflow.indexOf('npm run check');
  const versionIndex = workflow.indexOf('npm version "$REQUESTED_BUMP" --no-git-tag-version');

  assert.ok(checkIndex > -1);
  assert.ok(versionIndex > checkIndex);
  assert.match(workflow, /git add package\.json package-lock\.json/);
  assert.match(workflow, /git commit -m "chore: release \$\{TAG\} \[skip release\]"/);
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
  assert.match(readme, /exact Git commit SHA/i);
});
