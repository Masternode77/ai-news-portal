import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFormatLabel, visibleWordCount } from '../src/lib/public-route-label.js';

test('labels source-derived public formats without claiming original reporting', () => {
  assert.equal(publicFormatLabel({ public_content_tier: 'signal_card' }), 'Source Brief');
  assert.equal(publicFormatLabel({ public_content_tier: 'editorial_brief' }), 'Editorial Brief');
  assert.equal(publicFormatLabel({ public_content_tier: 'longform_analysis', articleText: 'short note' }), 'Analyst Note');
  assert.equal(publicFormatLabel({
    public_content_tier: 'longform_analysis',
    expertLensFull: { finalArticleBody: 'evidence '.repeat(1_200) },
  }), 'Deep Dive');
});

test('counts only visible words from the best available article body', () => {
  assert.equal(visibleWordCount({ expertLensFull: { finalArticleBody: 'one two three' } }), 3);
  assert.equal(visibleWordCount({ articleText: 'one two' }), 2);
  assert.equal(visibleWordCount({}), 0);
});
