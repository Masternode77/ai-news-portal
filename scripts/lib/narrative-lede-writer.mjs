import { forbiddenPublicPhraseMatches } from './copy-quality-guard.mjs';
import { publicTemplatePhraseMatches } from './public-template-phrase-guard.mjs';

function sentence(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function cleanFact(value = '', fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || forbiddenPublicPhraseMatches(text).length || publicTemplatePhraseMatches(text).length) return fallback;
  return text;
}

export function writeNarrativeLede({ article = {}, evidencePack = {}, angle = {}, tone = '' } = {}) {
  const actor = evidencePack.namedActors?.[0] || article.source || 'Infrastructure buyers';
  const layer = evidencePack.affectedInfrastructureLayer || 'AI infrastructure';
  const source = article.source || evidencePack.source || 'the source';
  const fact = cleanFact(evidencePack.facts?.[0], article.title || '');
  const secondFact = cleanFact(evidencePack.facts?.[1], evidencePack.commercialImplication || '');
  const title = article.title || fact || actor;

  return [
    sentence(`${title} is not just another AI headline for ${actor}; it sits in the ${layer} layer where capacity plans depend on delivery, cost, and control`),
    sentence(`${source}'s reporting centers on ${fact.replace(/\.$/, '')}, giving infrastructure readers an observable event to place against procurement calendars and operating risk`),
    tone === 'Skeptical columnist'
      ? sentence(`A cautious reading starts with the limit: ${secondFact.replace(/\.$/, '')}`)
      : sentence(`${secondFact.replace(/\.$/, '')} is where operators, buyers, and investors can compare the report with their own exposure`),
  ].join('\n\n');
}
