import assert from 'node:assert/strict';
import test from 'node:test';
import records from '../src/data/korea-briefs.json' with { type: 'json' };
import { assessKoreaBrief, buildKoreaBriefRssItems, getPublishedKoreaBriefs } from '../scripts/lib/korea-briefs.mjs';

const NOW = new Date('2026-09-06T12:00:00+09:00');

test('approved Korean snapshots have item-specific current KOGL-1 text permission', () => {
  assert.equal(records.length, 4);
  for (const record of records) {
    assert.equal(assessKoreaBrief(record, NOW).status, 'summary');
    assert.equal(record.license.type, 'KOGL-1');
    assert.equal(record.license.scope, 'text-only');
    assert.equal(record.license.evidenceUrl, record.sourceUrl);
    assert.equal(record.mediaIncluded, false);
    assert.ok(Date.parse(record.publishedAt) <= NOW.getTime());
    assert.ok(Date.parse(record.review.expiresAt) > NOW.getTime());
  }
});

test('missing item evidence and future publication dates fail closed', () => {
  const base = structuredClone(records[0]);
  delete base.license.evidenceUrl;
  assert.deepEqual(assessKoreaBrief(base, NOW), {
    status: 'blocked', reason: 'missing_item_specific_license_evidence',
  });

  const future = structuredClone(records[0]);
  future.publishedAt = '2027-01-01T00:00:00+09:00';
  assert.deepEqual(assessKoreaBrief(future, NOW), {
    status: 'blocked', reason: 'invalid_or_future_publication_date',
  });
});

test('unknown, non-commercial and no-derivatives licences return link-only records without summaries', () => {
  for (const type of ['unknown', 'KOGL-2', 'KOGL-3', 'KOGL-4']) {
    const record = structuredClone(records[0]);
    record.id = `rights-${type}`;
    record.license.type = type;
    const [published] = getPublishedKoreaBriefs([record], { now: NOW });
    assert.equal(published.publicationMode, 'link_only');
    assert.equal(published.summary, '');
  }
});

test('RSS contains approved source links and excludes blocked records', () => {
  const blocked = structuredClone(records[0]);
  blocked.id = 'expired';
  blocked.review.expiresAt = '2026-01-01T00:00:00+09:00';
  const items = buildKoreaBriefRssItems([...records, blocked], { now: NOW });
  assert.equal(items.length, records.length);
  assert.equal(items.every((item) => item.link.startsWith('https://www.korea.kr/')), true);
});

test('Korean RSS escapes publisher names in custom XML', () => {
  const record = { ...structuredClone(records[0]), source: 'Agency A & B <Research>' };
  const [item] = buildKoreaBriefRssItems([record], { now: NOW });
  assert.equal(item.customData, '<source>Agency A &amp; B &lt;Research&gt;</source>');
});
