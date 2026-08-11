import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceModule = path.join(repositoryRoot, 'scripts/lib/internal-language-guard.mjs');
const resolverModule = path.join(repositoryRoot, 'scripts/lib/repository-file-resolver.mjs');
const canonicalConfig = path.join(repositoryRoot, 'config/editorial/internal-public-banned-phrases.json');

test('sanitizes public copy when the bundled guard is relocated under a dist chunk directory', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-public-banned-path-'));
  const relocatedModule = path.join(tempRoot, 'dist/chunks/internal-language-guard.mjs');
  fs.mkdirSync(path.dirname(relocatedModule), { recursive: true });
  fs.copyFileSync(sourceModule, relocatedModule);
  fs.copyFileSync(resolverModule, path.join(path.dirname(relocatedModule), 'repository-file-resolver.mjs'));
  fs.mkdirSync(path.join(tempRoot, 'config/editorial'), { recursive: true });
  fs.copyFileSync(canonicalConfig, path.join(tempRoot, 'config/editorial/internal-public-banned-phrases.json'));
  fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"type":"module"}\n');

  try {
    const module = await import(`${pathToFileURL(relocatedModule).href}?relocated=${Date.now()}`);
    assert.equal(
      module.sanitizePublicCopy('Cycle status completed_no_qualifying_signals'),
      'No new stories yet.',
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
