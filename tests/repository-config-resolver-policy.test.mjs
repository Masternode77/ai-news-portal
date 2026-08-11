import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  findRepositoryRoot,
  resolveRepositoryFile,
} from '../scripts/lib/repository-file-resolver.mjs';
import { BANNED_PHRASES } from '../scripts/lib/banned-phrases.mjs';
import { loadInternalPublicBannedPhrases } from '../scripts/lib/internal-language-guard.mjs';
import { publicEmptyStateCopy } from '../scripts/lib/public-empty-state-copy.mjs';
import { PROPER_NOUN_REPLACEMENTS } from '../scripts/lib/proper-noun-normalizer.mjs';
import { PUBLIC_TEMPLATE_PHRASES } from '../scripts/lib/public-template-phrase-guard.mjs';
import { FORBIDDEN_PUBLIC_PHRASES } from '../scripts/lib/copy-quality-guard.mjs';
import { BOILERPLATE_PATTERN_CONFIG } from '../scripts/lib/boilerplate-detector.mjs';
import { loadSourceRegistry } from '../scripts/lib/source-registry.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyLoaders = [
  'banned-phrases.mjs',
  'internal-language-guard.mjs',
  'public-empty-state-copy.mjs',
  'proper-noun-normalizer.mjs',
  'public-template-phrase-guard.mjs',
  'copy-quality-guard.mjs',
  'boilerplate-detector.mjs',
  'source-registry.mjs',
];
const policyFixtures = new Map([
  ['config/bannedPhrases.yml', 'banned_phrases:\n  - canonical banned phrase\n'],
  ['config/editorial/internal-public-banned-phrases.json', '["canonical internal phrase"]\n'],
  ['config/editorial/public-empty-states.json', '{"no_latest_items":"Canonical empty state"}\n'],
  ['config/properNouns.yml', 'proper_nouns:\n  canonical: "Canonical"\n'],
  ['config/forbiddenPublicPhrases.yml', 'forbidden_public_phrases:\n  - canonical forbidden phrase\n'],
  ['config/boilerplatePatterns.yml', 'boilerplate_patterns:\n  - canonical boilerplate\ncopyright_footer_patterns:\n  - canonical copyright\nnav_or_cta_patterns:\n  - canonical cta\n'],
  ['config/sourceRegistry.yml', 'sources:\n  - id: canonical-source\n    name: Canonical Source\n    domain: canonical.example\n'],
]);

function createFakeProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'repository-config-resolver-'));
  const chunkPath = path.join(projectRoot, 'dist/.prerender/chunks/policy-loader.mjs');
  fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"resolver-fixture","type":"module"}\n');
  fs.mkdirSync(path.dirname(chunkPath), { recursive: true });
  fs.writeFileSync(chunkPath, 'export {};\n');

  for (const [relativePath, contents] of policyFixtures) {
    const fixturePath = path.join(projectRoot, relativePath);
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    fs.writeFileSync(fixturePath, contents);
  }

  const shadowPath = path.join(projectRoot, 'dist/config/bannedPhrases.yml');
  fs.mkdirSync(path.dirname(shadowPath), { recursive: true });
  fs.writeFileSync(shadowPath, 'banned_phrases:\n  - dist shadow phrase\n');
  fs.writeFileSync(path.join(projectRoot, 'dist/config/sourceRegistry.yml'), 'sources:\n  - id: stale-dist-source\n    name: Stale Dist Source\n    domain: stale.example\n');

  return { chunkPath, projectRoot };
}

test('resolves all canonical policy files from a bundled chunk despite an external cwd and dist shadow', () => {
  const { chunkPath, projectRoot } = createFakeProject();
  const externalCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'repository-config-resolver-cwd-'));
  const originalCwd = process.cwd();

  try {
    process.chdir(externalCwd);
    const moduleUrl = pathToFileURL(chunkPath).href;

    assert.equal(findRepositoryRoot(moduleUrl), projectRoot);
    for (const [relativePath, contents] of policyFixtures) {
      const resolved = resolveRepositoryFile(relativePath, { moduleUrl });
      assert.equal(resolved, path.join(projectRoot, relativePath));
      assert.equal(fs.readFileSync(resolved, 'utf8'), contents);
    }
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(externalCwd, { recursive: true, force: true });
  }
});

test('rejects a config path that escapes the canonical repository root', () => {
  const { chunkPath, projectRoot } = createFakeProject();

  try {
    assert.throws(
      () => resolveRepositoryFile('../outside-policy.yml', { moduleUrl: pathToFileURL(chunkPath).href }),
      /must stay within the repository root/i,
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('fails loudly when a canonical policy file is missing', () => {
  const { chunkPath, projectRoot } = createFakeProject();

  try {
    assert.throws(
      () => resolveRepositoryFile('config/missing-policy.yml', { moduleUrl: pathToFileURL(chunkPath).href }),
      /required canonical repository policy file is missing/i,
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('all Astro-reachable policy loaders use the shared resolver', () => {
  for (const loader of policyLoaders) {
    const source = fs.readFileSync(path.join(repositoryRoot, 'scripts/lib', loader), 'utf8');
    assert.match(source, /from '\.\/repository-file-resolver\.mjs';/);
    assert.doesNotMatch(source, /path\.resolve\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\), '\.\.\/\.\.'\)/);
  }
});

test('all policy loaders expose non-empty canonical policy behavior', async () => {
  assert.ok(BANNED_PHRASES.length > 0);
  assert.ok(loadInternalPublicBannedPhrases().length > 0);
  assert.ok(Object.keys(publicEmptyStateCopy()).length > 0);
  assert.ok(PROPER_NOUN_REPLACEMENTS.length > 0);
  assert.ok(PUBLIC_TEMPLATE_PHRASES.length > 0);
  assert.ok(FORBIDDEN_PUBLIC_PHRASES.length > 0);
  assert.ok(BOILERPLATE_PATTERN_CONFIG.boilerplate.length > 0);
  assert.ok((await loadSourceRegistry()).length > 0);
});
