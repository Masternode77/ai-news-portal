import assert from 'node:assert/strict';
import test from 'node:test';
import { antiTemplateGuardV2 } from '../scripts/lib/anti-template-guard-v2.mjs';
import { latestOpeningDiversityResult, recentOpeningInventory } from '../scripts/lib/anti-template-diversity-guard.mjs';

test('anti-template guard blocks banned autonomous desk phrases', () => {
  const result = antiTemplateGuardV2('Commercially, this is worth a local Compute Current read.');
  assert.equal(result.ok, false);
  assert.ok(result.matches.includes('Commercially,'));
});

test('opening diversity stores latest 30 and blocks repeated card and longform starts', () => {
  const repeatedCard = 'Power delivery now controls the campus schedule for buyers.';
  const repeatedBody = 'The same first twelve words should be blocked across generated longform articles before publication. Distinct follow-on analysis.';
  const articles = [
    { id: 'one', deck: repeatedCard, expertLensFull: { finalArticleBody: repeatedBody } },
    { id: 'two', deck: repeatedCard, expertLensFull: { finalArticleBody: repeatedBody } },
    ...Array.from({ length: 31 }, (_, index) => ({
      id: `recent-${index}`,
      deck: `Distinct card opening ${index} for infrastructure readers.`,
      expertLensFull: { finalArticleBody: `Distinct longform opening ${index} for infrastructure readers. More analysis follows.` },
    })),
  ];

  const inventory = recentOpeningInventory(articles, { limit: 30 });
  const result = latestOpeningDiversityResult(articles, { limit: 30 });

  assert.equal(inventory.length, 30);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('duplicate_card_opening_first_8_words'));
  assert.ok(result.reasons.includes('duplicate_longform_opening_first_12_words'));
});
