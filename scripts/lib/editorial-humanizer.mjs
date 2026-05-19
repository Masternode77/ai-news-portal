import { buildNarrativeArticleBody, buildNarrativeLensFields } from './narrative-dna.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';

export const EDITORIAL_HUMANIZER_MODE = 'narrative-dna-editorial-v1';
export const HUMANIZED_ARTICLE_MIN_CHARS = 1000;

export const EDITORIAL_BANNED_PATTERNS = [
  /\bExpert lens:\s*/gi,
  /\bThis signal matters because\b/gi,
  /\bThe strategic significance is not only\b/gi,
  /\bThe strategic significance is not onl\S*/gi,
  /\bThe strategic significance is\b/gi,
  /\bThe strategic significance\S*/gi,
  /\bwhat the market may be missing\b/gi,
  /\bOperators should read this through\b/gi,
  /\bInvestors should track whether\b/gi,
  /\bInvestors will care whether\b/gi,
  /\bHyperscalers should focus on whether\b/gi,
  /\bThe important question is not only what was announced\b/gi,
  /\bThe important questio\S*/gi,
  /\bmatters most for how quickly\b/gi,
  /\bis worth watching for how quickly\b/gi,
  /\bdepends on how quickly\b/gi,
  /\bturn demand into reliable capacity\b/gi,
  /\bmatters because it shifts\b/gi,
  /\bis worth watching because it shifts\b/gi,
  /\bwhat it changes for\b/gi,
  /\bwhat it changes\S*/gi,
  /\bFor investors, the useful read-through is\b/gi,
  /\bFor operators, the story comes down to\b/gi,
  /\bFor hyperscalers and cloud providers, watch whether\b/gi,
  /\bCloud buyers will watch whether\b/gi,
  /^\s*Why it matters\s*$/gim,
  /^\s*Pressure points\s*$/gim,
  /^\s*Market implications\s*$/gim,
  /^\s*What to watch\s*$/gim,
];

const EDITORIAL_REPLACEMENTS = [
  [/\bExpert lens:\s*/gi, ''],
  [/\bThis signal matters because it changes\b/gi, 'The practical effect is on'],
  [/\bThis signal matters because\b/gi, 'The point is that'],
  [/\bThe strategic significance is not only the announcement itself but how it changes\b/gi, 'The source-backed question is how it could change'],
  [/\bThe strategic significance is not only[^.]*\.?/gi, 'The source-backed question is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance is not onl\S*/gi, 'The source-backed question is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance is[^.]*$/gi, 'The source-backed question is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe strategic significance\S*/gi, 'The source-backed question is how this could change capacity planning, vendor leverage, and deployment sequencing.'],
  [/\bThe important question is not only what was announced, but whether\b/gi, 'The test is whether'],
  [/\bThe important questio\S*/gi, 'The test is whether the execution details hold up.'],
  [/\bwhat the market may be missing\b/gi, 'the risk still being underpriced'],
  [/\bInvestors should track whether\b/gi, 'Investors will be watching whether'],
  [/\bFor investors, the useful read-through is whether\b/gi, 'Investors will care whether'],
  [/\bInvestors will care whether\b/gi, 'Investors will test whether'],
  [/\bOperators should read this through\b/gi, 'Operators will read this through'],
  [/\bFor operators, the story comes down to\b/gi, 'For operators, the pressure sits in'],
  [/\bHyperscalers should focus on whether\b/gi, 'Hyperscalers will be watching whether'],
  [/\bFor hyperscalers and cloud providers, watch whether\b/gi, 'Cloud buyers will watch whether'],
  [/\bCloud buyers will watch whether\b/gi, 'Cloud buyers will be looking for evidence that'],
  [/\b[A-Za-z ]+ raises a practical capacity question after\b/gi, 'The source-backed read starts with'],
  [/\b[A-Za-z ]+ turns component availability into a delivery test after\b/gi, 'The supply-chain read starts with'],
  [/\b[A-Za-z ]+ puts grid timing back into the operating plan after\b/gi, 'The power-market read starts with'],
  [/\bThe useful follow-up is the next [^.]+ disclosure that confirms timing, site readiness, buyer commitment, or operating impact\.?/gi, 'The watch item should be a source-specific operating metric.'],
  [/\bThe useful follow-up is\b/gi, 'Watch'],
  [/\bstill has to show that the reported change can survive real deployment, financing, or operating constraints\.?/gi, 'still needs source-backed deployment, financing, or operating evidence.'],
  [/\bbelongs on the board only if\b/gi, 'matters to readers when'],
  [/\bread-through\b/gi, 'implication'],
  [/\bstrategic read-through\b/gi, 'market implication'],
  [/\b(.{8,180}?) matters most for how quickly\b/gi, '$1 is worth watching for how quickly'],
  [/\b(.{8,180}?) is worth watching for how quickly\b/gi, '$1 depends on how quickly'],
  [/\b(.{8,180}?) matters because it shifts\b/gi, '$1 is worth watching because it shifts'],
  [/\b(.{8,180}?) is worth watching because it shifts\b/gi, '$1 could shift'],
  [/\b:\s*what it changes for\b/gi, ': the capacity question for'],
  [/\b:\s*what it changes\S*/gi, ': the capacity question'],
  [/\bLink Gift Expand\b/gi, ''],
  [/\bX LinkedIn Email Link Gift Gift this article\b/gi, ''],
  [/\bContact us:\s*Provide news feedback or report an error Confidential tip\S*/gi, ''],
  [/^\s*Why it matters\s*$/gim, ''],
  [/^\s*Pressure points\s*$/gim, ''],
  [/^\s*Market implications\s*$/gim, ''],
  [/^\s*What to watch\s*$/gim, ''],
];

export const EDITORIAL_HUMANIZER_PROMPT = [
  'Rewrite AI-generated industry coverage into a natural newsroom voice.',
  'Sound like a sharp editor at a respected business or technology publication: clear, grounded, specific, and reader-first.',
  'Preserve facts, dates, source attribution, and uncertainty. Do not invent numbers, quotes, or motives.',
  'Avoid template phrases such as "strategic significance", "this signal matters", "operators should read this through", and "what the market may be missing".',
  'Do not write like a consulting memo. Avoid repeated "For investors / For operators / For hyperscalers" scaffolding unless the distinction is genuinely useful.',
  'Open with what changed, explain why a busy reader should care, name the practical constraint or second-order effect, then end with what to watch next.',
  'Put a clear hook in the headline or opening paragraph so the reader immediately understands why this is worth clicking.',
  'Provide a three-line executive summary for busy readers: what changed, why it matters, and what to watch.',
  'Use varied sentence length, active verbs, and concrete nouns. Do not mention humanization or AI-detection in reader-facing copy.',
  'The final article body should be at least 1,000 characters, written as continuous reported analysis with no repeated section headings.',
].join(' ');

function compactWhitespace(text = '') {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*…/g, '…')
    .replace(/…\./g, '…')
    .replace(/\.{2,}/g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function normalizeEditorialVoice(text = '') {
  let cleaned = compactWhitespace(text);
  for (const [pattern, replacement] of EDITORIAL_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return normalizeProperNouns(cleaned
    .replace(/\s+\.\s*/g, '. ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+;/g, ';')
    .replace(/\s+…$/g, '')
    .replace(/…$/g, '')
    .replace(/\s+/g, ' ')
    .trim());
}

export function containsTemplateLanguage(text = '') {
  return EDITORIAL_BANNED_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function normalizeEditorialParagraphs(text = '') {
  return String(text || '')
    .split(/\n{2,}/)
    .map((paragraph) => normalizeEditorialVoice(paragraph))
    .filter(Boolean)
    .filter((paragraph, index, list) => {
      const key = paragraph.toLowerCase();
      return list.findIndex((item) => item.toLowerCase() === key) === index;
    });
}

function sourceLead(source, summary) {
  const cleanedSummary = normalizeEditorialVoice(summary).replace(/[.…]+$/, '');
  if (!cleanedSummary) return '';
  const sentence = cleanedSummary.charAt(0).toUpperCase() + cleanedSummary.slice(1);
  return `${source} reported: ${sentence}.`;
}

function bestAvailableSourceText(article = {}, sections = {}) {
  const candidates = [
    article.articleText,
    article.contentText,
    article.snippet,
    article.summary,
    sections.summary,
    article.title,
  ]
    .map((value) => normalizeEditorialVoice(value || '').replace(/[.…]+$/, ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return candidates[0] || '';
}

export function buildHumanizedArticleBody(article = {}, sections = {}) {
  return buildNarrativeArticleBody({
    ...article,
    summary: sections.summary || article.summary,
    category: sections.category || article.category,
    expert_insight: {
      ...(article.expert_insight || article.expertInsight || {}),
      counterargument: sections.marketMissing || article.expert_insight?.counterargument,
      next_observable_signal: sections.watchNext || article.expert_insight?.next_observable_signal,
    },
  });
}

export function humanizedFallbackSections(article, signal) {
  const summary = normalizeEditorialVoice(
    article.summary || article.snippet || article.contentText || article.articleText || article.title
  );
  const narrative = buildNarrativeLensFields({
    ...article,
    summary,
    expert_insight: {
      ...(article.expert_insight || article.expertInsight || {}),
      counterargument: signal || article.expert_insight?.counterargument,
    },
  });

  return {
    ...narrative,
    summary,
    category: article.category || 'AI infrastructure',
  };
}
