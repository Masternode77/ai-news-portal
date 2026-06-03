import assert from 'node:assert/strict';
import test from 'node:test';
import { appendAdminAuditEntry, summarizeAdminAuditChange } from '../scripts/lib/admin-audit-log.mjs';

test('admin audit log records actor action before after timestamp and commit sha', () => {
  const entry = summarizeAdminAuditChange({
    before: { title: 'Old', public_status: 'draft', summary: 'Old dek' },
    after: { title: 'New', public_status: 'published', summary: 'New dek' },
    actor: 'owner',
    action: 'publish',
    articleId: 'article-1',
    timestamp: '2026-05-31T06:20:00.000Z',
    commitSha: 'abc123',
  });

  assert.equal(entry.actor, 'owner');
  assert.equal(entry.action, 'publish');
  assert.equal(entry.articleId, 'article-1');
  assert.equal(entry.timestamp, '2026-05-31T06:20:00.000Z');
  assert.equal(entry.commitSha, 'abc123');
  assert.deepEqual(entry.changedFields, ['public_status', 'summary', 'title']);
  assert.match(entry.summary, /draft -> published/);

  const log = appendAdminAuditEntry([{ action: 'save-draft' }], entry);
  assert.equal(log.length, 2);
  assert.deepEqual(log[1], entry);
});
