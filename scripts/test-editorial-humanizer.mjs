import assert from 'node:assert/strict';
import {
  buildHumanizedArticleBody,
  containsTemplateLanguage,
  humanizedFallbackSections,
  HUMANIZED_ARTICLE_MIN_CHARS,
  normalizeEditorialVoice,
} from './lib/editorial-humanizer.mjs';

const templateText = [
  'Expert lens: This signal matters because it changes compute supply.',
  'The strategic significance is not only the announcement itself but how it changes capacity planning.',
  'Investors should track whether this development improves pricing power.',
  'Operators should read this through procurement timing.',
  'Hyperscalers should focus on whether this changes build sequencing.',
].join(' ');

const cleaned = normalizeEditorialVoice(templateText);

assert.ok(!/Expert lens/i.test(cleaned));
assert.ok(!/This signal matters/i.test(cleaned));
assert.ok(!/strategic significance/i.test(cleaned));
assert.ok(!/Investors should track/i.test(cleaned));
assert.ok(!/Operators should read/i.test(cleaned));
assert.ok(!/Hyperscalers should focus/i.test(cleaned));

const article = {
  title: 'Cloud provider expands AI data center capacity',
  source: 'Example Source',
  summary: 'a cloud provider is expanding capacity for AI workloads',
  category: 'Hyperscalers & Cloud',
};

const sections = humanizedFallbackSections(
  article,
  'Power access and interconnection timing are likely to matter more than the announced demand signal itself.'
);
const body = buildHumanizedArticleBody(article, sections);

assert.ok(body.includes('Example Source reported'));
assert.ok(body.split(/\n{2,}/).length >= 3);
assert.ok(body.length >= HUMANIZED_ARTICLE_MIN_CHARS);
assert.equal(containsTemplateLanguage(body), false);
assert.equal(/Why it matters|Pressure points|Market implications|What to watch/i.test(body), false);
assert.equal(containsTemplateLanguage(sections.investors), false);
assert.equal(containsTemplateLanguage(sections.operators), false);
assert.equal(containsTemplateLanguage(sections.hyperscalers), false);

console.log('editorial humanizer test passed');
