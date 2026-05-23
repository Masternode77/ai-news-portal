import assert from 'node:assert/strict';
import test from 'node:test';
import {
  publicEmptyStateCopy,
  publicEmptyStateText,
} from '../scripts/lib/public-empty-state-copy.mjs';

test('public empty state copy stays short and human', () => {
  const text = publicEmptyStateText('no_latest_items');
  assert.equal(text, 'No new stories yet.');
  assert.equal(/cycle|qualifying|completed_no_qualifying_signals|routing/i.test(text), false);
});

test('all configured public empty states avoid internal status language', () => {
  for (const value of Object.values(publicEmptyStateCopy())) {
    assert.equal(/cycle|qualifying|completed_no_qualifying_signals|workflow|policy/i.test(value), false, value);
  }
});
