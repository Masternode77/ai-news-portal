import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const SKILLS = [
  'compute-current-forensics',
  'compute-current-source-quality',
  'compute-current-relevance',
  'compute-current-evidence',
  'compute-current-angle',
  'compute-current-writer',
  'compute-current-editor',
  'compute-current-fidelity',
  'compute-current-diversity',
  'compute-current-design-qa',
  'compute-current-security',
  'compute-current-sre',
];

const EXPECTED_PLAYBOOKS = [
  'editorial-workflow',
  'eval',
  'source-health',
  'public-audit',
  'visual-qa',
  'deployment-verification',
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parseFrontmatter(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(markdown);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');

  const fields = {};
  for (const line of match[1].split('\n')) {
    const fieldMatch = /^([a-zA-Z][\w-]*):\s*(.+)$/.exec(line);
    assert.ok(fieldMatch, `invalid frontmatter line: ${line}`);
    fields[fieldMatch[1]] = fieldMatch[2].replace(/^["']|["']$/g, '');
  }

  return { fields, body: match[2] };
}

test('repo-local Compute Current skills exist with valid concise frontmatter and grounded commands', () => {
  for (const skill of SKILLS) {
    const markdown = read(`.agents/skills/${skill}/SKILL.md`);
    const { fields, body } = parseFrontmatter(markdown);

    assert.equal(fields.name, skill);
    assert.ok(fields.description.length >= 40, `${skill} description is too thin`);
    assert.ok(fields.description.length <= 220, `${skill} description should stay concise`);
    assert.match(body, /npm run|node --test|node scripts\//, `${skill} should cite existing repo commands`);
    assert.match(body, /AGENTS|Canonical|Useful Commands|Workflow|Rules/, `${skill} should be grounded in repo workflow`);
  }
});

test('Compute Current editorial OS plugin manifest and structure are valid', () => {
  const pluginRoot = 'plugins/compute-current-editorial-os';
  const manifest = JSON.parse(read(`${pluginRoot}/.codex-plugin/plugin.json`));

  assert.equal(manifest.name, 'compute-current-editorial-os');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.hooks, undefined, 'plugin manifest should not use unsupported hooks field');
  assert.ok(manifest.interface.displayName);
  assert.ok(manifest.interface.shortDescription);
  assert.ok(manifest.interface.longDescription);
  assert.ok(manifest.interface.defaultPrompt.length <= 3);

  const hooks = JSON.parse(read(`${pluginRoot}/hooks/hooks.json`));
  assert.deepEqual(hooks, { hooks: {} });

  for (const skill of SKILLS) {
    const repoMarkdown = read(`.agents/skills/${skill}/SKILL.md`);
    const markdown = read(`${pluginRoot}/skills/${skill}/SKILL.md`);
    const { fields, body } = parseFrontmatter(markdown);
    assert.equal(fields.name, skill);
    assert.match(body, /npm run|node --test|node scripts\//, `${skill} plugin skill should cite repo commands`);
    assert.equal(markdown, repoMarkdown, `${skill} plugin mirror must match the canonical repo-local skill`);
  }

  for (const playbook of EXPECTED_PLAYBOOKS) {
    const markdown = read(`${pluginRoot}/commands/${playbook}.md`);
    const { fields, body } = parseFrontmatter(markdown);
    assert.ok(fields.description, `${playbook} playbook needs a description`);
    assert.match(body, /npm run|node --test|node scripts\//, `${playbook} playbook should cite repo commands`);
  }

  assert.match(read(`${pluginRoot}/README.md`), /reference playbooks/i);
});
