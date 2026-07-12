import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FilePublicationReceiptError,
  FilePublicationReceiptStore,
} from '../src/core/state/index.mjs';

function completedReceipt() {
  return {
    runId: 'cycle-1',
    pipelineVersion: '5.6.0-test',
    status: 'completed',
    startedAt: '2026-07-12T00:00:00.000Z',
    attempts: 1,
    completedAt: '2026-07-12T00:01:00.000Z',
    result: { latestCount: 12, publishedCount: 1 },
  };
}

test('file publication receipt store atomically round-trips a durable journal', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-receipts-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new FilePublicationReceiptStore(path.join(directory, 'journal.json'));

  assert.deepEqual(await store.load(), { publicationReceipts: {} });
  await store.save({ publicationReceipts: { 'cycle-1': completedReceipt() } });
  assert.deepEqual(await store.load(), {
    publicationReceipts: { 'cycle-1': completedReceipt() },
  });
});

test('file publication receipt store fails closed on malformed journals', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-receipts-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'journal.json');
  const store = new FilePublicationReceiptStore(filePath);
  await fs.writeFile(filePath, '{"schemaVersion":1,"publicationReceipts":{"cycle-1":{}}}\n');

  await assert.rejects(
    () => store.load(),
    (error) => error instanceof FilePublicationReceiptError
      && error.code === 'invalid_publication_receipt',
  );
});

test('file publication receipt store rejects invalid and reversed timestamps', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-receipts-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new FilePublicationReceiptStore(path.join(directory, 'journal.json'));

  await assert.rejects(
    () => store.save({
      publicationReceipts: {
        'cycle-1': { ...completedReceipt(), startedAt: 'not-a-date' },
      },
    }),
    (error) => error instanceof FilePublicationReceiptError
      && error.code === 'invalid_publication_receipt',
  );
  await assert.rejects(
    () => store.save({
      publicationReceipts: {
        'cycle-1': {
          ...completedReceipt(),
          completedAt: '2026-07-11T23:59:00.000Z',
        },
      },
    }),
    (error) => error instanceof FilePublicationReceiptError
      && error.code === 'invalid_publication_receipt',
  );
});
