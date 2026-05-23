import { cleanBoilerplateText } from './boilerplate-detector.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { guardPublicTemplatePhrases } from './public-template-phrase-guard.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';

const TEMPLATE_HEADINGS = /^(editor'?s brief|why it matters|pressure points|market implications|what to watch|the next signal|at a glance)$/i;

export function cleanArticleParagraph(paragraph = '') {
  const cleaned = normalizeProperNouns(cleanBoilerplateText(String(paragraph || '')))
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || TEMPLATE_HEADINGS.test(cleaned)) return '';
  const publicGuard = guardPublicCopy(cleaned);
  const templateGuard = guardPublicTemplatePhrases(publicGuard.text || cleaned);
  if (!publicGuard.ok || !templateGuard.ok) return '';
  return publicGuard.text;
}

export function cleanArticleBodyBlocks(body = '') {
  return String(body || '')
    .split(/\n{2,}/)
    .map(cleanArticleParagraph)
    .filter(Boolean);
}
