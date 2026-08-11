import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceModule = path.join(repositoryRoot, 'scripts/lib/banned-phrases.mjs');
const resolverModule = path.join(repositoryRoot, 'scripts/lib/repository-file-resolver.mjs');
const canonicalConfig = path.join(repositoryRoot, 'config/bannedPhrases.yml');

test('loads the canonical config when a bundled module is relocated under a dist chunk directory', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'banned-phrases-build-'));
  const relocatedModule = path.join(tempRoot, 'dist/chunks/banned-phrases.mjs');
  fs.mkdirSync(path.dirname(relocatedModule), { recursive: true });
  fs.copyFileSync(sourceModule, relocatedModule);
  fs.copyFileSync(resolverModule, path.join(path.dirname(relocatedModule), 'repository-file-resolver.mjs'));
  fs.mkdirSync(path.join(tempRoot, 'config'), { recursive: true });
  fs.copyFileSync(canonicalConfig, path.join(tempRoot, 'config/bannedPhrases.yml'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}\n');

  try {
    const module = await import(`${pathToFileURL(relocatedModule).href}?relocated=${Date.now()}`);
    assert.ok(module.BANNED_PHRASES.includes('strategic significance'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
