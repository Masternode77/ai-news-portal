import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const staticImport = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

function relativeImportGraph(entry) {
  const pending = [entry];
  const seen = new Map();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    seen.set(file, source);
    for (const match of source.matchAll(staticImport)) {
      const imported = path.resolve(path.dirname(file), match[1]);
      if (fs.existsSync(imported)) pending.push(imported);
    }
  }
  return seen;
}

test('only the media function imports the native image runtime', () => {
  const apiDir = path.join(root, 'api/admin');
  const entries = fs.readdirSync(apiDir)
    .filter((name) => name.endsWith('.js') && !name.startsWith('_'));
  for (const entry of entries) {
    const graph = relativeImportGraph(path.join(apiDir, entry));
    const sharpFiles = [...graph]
      .filter(([, source]) => /from\s+['"]sharp['"]/.test(source))
      .map(([file]) => path.relative(root, file));
    if (entry === 'media.js') {
      assert.deepEqual(sharpFiles, ['src/plugins/storage/admin-media-storage.mjs']);
    } else {
      assert.deepEqual(sharpFiles, [], `${entry} must not bundle sharp`);
    }
  }
});

test('Vercel functions exclude local state and static publishing inventories', () => {
  const functions = vercel.functions?.['api/admin/*.js'];
  assert.equal(
    functions?.includeFiles,
    '{config/**/*.yml,config/**/*.json,src/data/{editorial-cycles,claim-ledger,source-health}.json}',
  );
  assert.equal(
    functions?.excludeFiles,
    '{.cache/**,public/generated/**,src/data/{latest-news,archived-news,search-index,taxonomy-pages}.json}',
  );
});

test('Vercel upload ignores local CMS, QA, and agent state', () => {
  const ignored = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split(/\r?\n/);
  for (const entry of ['.cache/', '.omx/', '.codex/', '.agents/', 'artifacts/', 'evidence/']) {
    assert.ok(ignored.includes(entry), `${entry} must stay outside deployment uploads`);
  }
});
