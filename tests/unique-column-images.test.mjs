import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectCodexImageJobs, inspectCodexImageRegistrations } from '../scripts/prepare-codex-images.mjs';
import { registerCodexImage, imageFingerprint } from '../scripts/lib/codex-image-provider.mjs';

const column = {
  id: 'col-unique', content_origin: 'authored', slug: 'unique-column',
  title: 'A campus waits for its substation', deck: 'Commissioning sets the delivery date.',
  expertLensFull: { finalArticleBody: 'Approved column body.' },
  authored_quality: { ok: true }, imageProvider: 'codex', imageStatus: 'generated',
  heroImage: '/generated/shared.webp',
};

test('CLI reads authored columns alongside news and stops queuing after a successful import', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-column-cli-'));
  const queueScript = fileURLToPath(new URL('../scripts/prepare-codex-images.mjs', import.meta.url));
  const importScript = fileURLToPath(new URL('../scripts/import-codex-image.mjs', import.meta.url));
  const run = (script, args) => {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  try {
    await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
    await fs.mkdir(path.join(root, 'config'));
    await fs.writeFile(path.join(root, 'src/data/latest-news.json'), '[]');
    await fs.writeFile(path.join(root, 'src/data/archived-news.json'), '[]');
    await fs.writeFile(path.join(root, 'src/data/authored-columns.json'), JSON.stringify([column]));
    const [job] = run(queueScript, ['--id', column.id]).jobs;
    assert.equal(job.action, 'generate');
    const source = path.join(root, 'new.png');
    await sharp({ create: { width: 640, height: 360, channels: 3, background: '#987654' } }).png().toFile(source);
    run(importScript, ['--id', column.id, '--file', source, '--fingerprint', job.fingerprint]);
    assert.deepEqual(run(queueScript, ['--id', column.id]).jobs, []);
    const saved = JSON.parse(await fs.readFile(path.join(root, 'src/data/authored-columns.json')))[0];
    assert.equal(saved.title, column.title);
    assert.equal(saved.imageStatus, 'generated');
    assert.notEqual(saved.heroImage, column.heroImage);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('published column with inherited artwork is queued; draft and valid unique column are not', () => {
  assert.equal(selectCodexImageJobs([column])[0]?.action, 'generate');
  assert.deepEqual(selectCodexImageJobs([{ ...column, draft: true }]), []);
  assert.deepEqual(selectCodexImageJobs([column], { [column.id]: { state: 'valid' } }), []);
});

test('shared column registration requires new generation instead of source recovery', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-unique-column-'));
  const options = { publicDir: root, manifestPath: path.join(root, 'manifest.json') };
  try {
    const bytes = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#123456' } }).png().toBuffer();
    const entry = await registerCodexImage({ id: 'wire', title: 'Wire story' }, bytes, options);
    const manifest = JSON.parse(await fs.readFile(options.manifestPath, 'utf8'));
    manifest.images[column.id] = { ...entry, fingerprint: imageFingerprint(column) };
    await fs.writeFile(options.manifestPath, JSON.stringify(manifest));
    const states = await inspectCodexImageRegistrations([column], options);
    assert.equal(states[column.id].state, 'shared');
    const [job] = selectCodexImageJobs([column], states);
    assert.equal(job.action, 'generate');
    assert.match(job.prompt, /new.*image/i);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('column importer rejects another article source, including its normalized WebP; own retry is allowed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-unique-import-'));
  const options = { publicDir: root, manifestPath: path.join(root, 'manifest.json') };
  try {
    const bytes = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#123456' } }).png().toBuffer();
    const entry = await registerCodexImage({ id: 'wire', title: 'Wire story' }, bytes, options);
    await assert.rejects(registerCodexImage(column, bytes, options), /unique|already.*article/i);
    const normalized = await fs.readFile(path.join(root, entry.sourcePath.slice(1)));
    await assert.rejects(registerCodexImage(column, normalized, options), /unique|already.*article/i);
    const fresh = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#abcdef' } }).png().toBuffer();
    await registerCodexImage(column, fresh, options);
    await registerCodexImage(column, fresh, options);
    await assert.rejects(registerCodexImage({ id: 'wire2', title: 'Other wire' }, fresh, options), /unique|already.*article/i);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('recovering a textured column source preserves its identity and blocks reuse of the original PNG', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-column-recovery-'));
  const options = { publicDir: root, manifestPath: path.join(root, 'manifest.json') };
  try {
    const pixels = Buffer.alloc(640 * 360 * 3);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 17 + Math.floor(i / 97)) % 251;
    const original = await sharp(pixels, { raw: { width: 640, height: 360, channels: 3 } }).png().toBuffer();
    const first = await registerCodexImage(column, original, options);
    const source = await fs.readFile(path.join(root, first.sourcePath.slice(1)));
    const recovered = await registerCodexImage(column, source, options);
    assert.equal(recovered.sha256, first.sha256);
    await assert.rejects(registerCodexImage({ id: 'other', title: 'Another story' }, original, options), /unique|already.*article/i);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('simultaneous columns cannot claim the same artwork', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-column-race-'));
  const options = { publicDir: root, manifestPath: path.join(root, 'manifest.json') };
  try {
    const bytes = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#293847' } }).png().toBuffer();
    const results = await Promise.allSettled([column, { ...column, id: 'second-column' }].map(item => registerCodexImage(item, bytes, options)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.match(results.find(result => result.status === 'rejected').reason.message, /unique/);
    const manifest = JSON.parse(await fs.readFile(options.manifestPath, 'utf8'));
    assert.equal(Object.keys(manifest.images).length, 1);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
