import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readJsonFile, readPipelineState } from '../scripts/lib/state-store.mjs';

test('JSON state defaults only when the file is absent', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-state-security-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const missing = path.join(root, 'missing.json');

  assert.deepEqual(await readJsonFile(missing, []), []);
});

test('JSON state fails closed on malformed input and incompatible top-level shapes', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-state-security-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const malformed = path.join(root, 'malformed.json');
  const wrongArray = path.join(root, 'wrong-array.json');
  const wrongObject = path.join(root, 'wrong-object.json');

  await fs.writeFile(malformed, '{broken-json', 'utf8');
  await fs.writeFile(wrongArray, '{}', 'utf8');
  await fs.writeFile(wrongObject, '[]', 'utf8');

  await assert.rejects(readJsonFile(malformed, []), /parse|json/i);
  await assert.rejects(readJsonFile(wrongArray, []), /shape|array/i);
  await assert.rejects(readJsonFile(wrongObject, {}), /shape|object/i);
  await assert.rejects(readPipelineState(wrongObject), /shape|object/i);
});
