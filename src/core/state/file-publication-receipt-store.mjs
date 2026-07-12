import fs from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;
const RECEIPT_STATUSES = new Set(['preparing', 'completed']);

export class FilePublicationReceiptError extends Error {
  constructor(message, code = 'file_publication_receipt_error') {
    super(message);
    this.name = 'FilePublicationReceiptError';
    this.code = code;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value) {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function validateReceipt(receipt, runId) {
  if (!receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || receipt.runId !== runId
    || !nonEmptyString(receipt.pipelineVersion)
    || !RECEIPT_STATUSES.has(receipt.status)
    || !validTimestamp(receipt.startedAt)
    || !Number.isInteger(receipt.attempts)
    || receipt.attempts < 1) {
    throw new FilePublicationReceiptError('publication receipt is invalid', 'invalid_publication_receipt');
  }
  if (receipt.status === 'completed'
    && (!validTimestamp(receipt.completedAt)
      || Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)
      || !receipt.result
      || typeof receipt.result !== 'object'
      || Array.isArray(receipt.result))) {
    throw new FilePublicationReceiptError('completed publication receipt is invalid', 'invalid_publication_receipt');
  }
  return receipt;
}

function validateJournal(journal) {
  if (!journal
    || typeof journal !== 'object'
    || Array.isArray(journal)
    || journal.schemaVersion !== SCHEMA_VERSION
    || !journal.publicationReceipts
    || typeof journal.publicationReceipts !== 'object'
    || Array.isArray(journal.publicationReceipts)) {
    throw new FilePublicationReceiptError('publication receipt journal is invalid', 'invalid_publication_receipt_journal');
  }
  for (const [runId, receipt] of Object.entries(journal.publicationReceipts)) {
    validateReceipt(receipt, runId);
  }
  return journal;
}

function asJournal(state = {}) {
  return validateJournal({
    schemaVersion: SCHEMA_VERSION,
    publicationReceipts: structuredClone(state.publicationReceipts || {}),
  });
}

export class FilePublicationReceiptStore {
  constructor(filePath) {
    if (!nonEmptyString(filePath)) {
      throw new FilePublicationReceiptError('publication receipt path is required', 'invalid_publication_receipt_path');
    }
    this.filePath = path.resolve(filePath);
  }

  async load() {
    try {
      const journal = validateJournal(JSON.parse(await fs.readFile(this.filePath, 'utf8')));
      return { publicationReceipts: structuredClone(journal.publicationReceipts) };
    } catch (error) {
      if (error?.code === 'ENOENT') return { publicationReceipts: {} };
      if (error instanceof FilePublicationReceiptError) throw error;
      throw new FilePublicationReceiptError('publication receipt journal could not be read', 'publication_receipt_read_failed');
    }
  }

  async save(state) {
    const journal = asJournal(state);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
      await fs.rename(temporaryPath, this.filePath);
    } catch {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw new FilePublicationReceiptError('publication receipt journal could not be saved', 'publication_receipt_write_failed');
    }
    return { publicationReceipts: structuredClone(journal.publicationReceipts) };
  }
}
