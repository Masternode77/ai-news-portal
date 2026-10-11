import { ARTICLE_BLUEPRINTS, normalizeBlueprintId } from './article-blueprints.mjs';
import { BANNED_PHRASES, bannedPhraseMatches } from './banned-phrases.mjs';
import { normalizeEditorialParagraphs } from './editorial-humanizer.mjs';
import { sanitizeGeneratedText } from './normalize.mjs';
import { hasPublishedArticlePage } from './article-publication-state.mjs';

export const REPETITION_SENTENCE_RATIO_THRESHOLD = 0.12;
export const HEADING_SEQUENCE_SIMILARITY_THRESHOLD = 0.75;
export const CONCLUSION_SIMILARITY_THRESHOLD = 0.7;
// Lead-template reuse: the opening sentence rebuilt from the same frame with
// different nouns swapped in ("I track X the way most people track Y, and the
// single most underpriced variable in the current Z cycle is W"). Token
// overlap misses it because the nouns differ, so the first sentence is reduced
// to a skeleton of function words with content runs collapsed to placeholders
// and the skeletons are compared as sequences. On the published columns the
// three original variants score 0.889-1.0 against each other, the corrected
// openings score at most 0.56 against them, and no two live column leads
// score above 0.64. Skeletons with fewer than LEAD_TEMPLATE_MIN_FRAME_TOKENS
// frame words carry too little structure to compare and score 0.
export const LEAD_TEMPLATE_SIMILARITY_THRESHOLD = 0.8;
export const LEAD_TEMPLATE_MIN_FRAME_TOKENS = 6;
export const RECENT_ARTICLE_LIMIT = 50;
export const BANNED_PHRASE_WINDOW = 10;

export const REPETITION_BANNED_PHRASES = BANNED_PHRASES;

const KNOWN_HEADINGS = new Set(ARTICLE_BLUEPRINTS.flatMap((blueprint) => blueprint.sectionHeadings));
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'as',
  'by',
  'at',
  'from',
  'that',
  'this',
  'it',
  'is',
  'are',
  'be',
  'can',
  'will',
  'should',
]);

// Function words that carry a sentence's construction rather than its subject.
// Everything else is treated as swappable content when building a lead skeleton.
const LEAD_FRAME_TOKENS = new Set(`
a an the this that these those it its i we you he she they them me us my our your his her their
and or but nor so yet if then than as because while when where what which who whom whose how why
in on at to of for with by from into onto over under about across through between among against
without within before after during until since up out off
is are was were be been being am do does did has have had can could will would shall should may
might must not no never only just also even still already again once ever
most more less much many few single every each all any some same other another such both either
neither way here there now
`.split(/\s+/).filter(Boolean));

function normalizedText(text = '') {
  return sanitizeGeneratedText(text)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9가-힣\s.'"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function articleBody(article = {}) {
  return article.expertLensFull?.finalArticleBody || article.finalArticleBody || article.articleText || article.summary || '';
}

function splitSentences(text = '') {
  return normalizeEditorialParagraphs(text)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map(normalizedText)
    .map((sentence) => sentence.replace(/^[\s"'(-]+|[\s"')-]+$/g, '').trim())
    .filter((sentence) => sentence.length >= 35);
}

function splitParagraphs(text = '') {
  return normalizeEditorialParagraphs(text)
    .map(normalizedText)
    .filter((paragraph) => paragraph.length >= 45);
}

function isHeadingLine(line = '') {
  const trimmed = line.trim();
  if (KNOWN_HEADINGS.has(trimmed)) return true;
  if (trimmed.length > 72) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return /^[A-Z0-9][A-Za-z0-9 &:/+-]+$/.test(trimmed);
}

function headingSequence(article = {}) {
  const body = articleBody(article);
  const bodyLines = normalizeEditorialParagraphs(body);
  const sequence = bodyLines.filter(isHeadingLine);

  if (sequence.length) return sequence;
  return article.articleBlueprint?.sectionHeadings || article.expertLensFull?.blueprint?.sectionHeadings || [];
}

function lcsLength(left = [], right = []) {
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      table[i][j] = left[i - 1] === right[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  return table[left.length][right.length];
}

function sequenceSimilarity(left = [], right = []) {
  if (!left.length || !right.length) return 0;
  return lcsLength(left, right) / Math.max(left.length, right.length);
}

function tokenize(text = '') {
  return normalizedText(text)
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9가-힣]+|[^a-z0-9가-힣]+$/g, ''))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function ngrams(tokens = [], size = 5) {
  const grams = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    grams.push(tokens.slice(index, index + size).join(' '));
  }
  return grams;
}

function setOverlapRatio(left = [], right = []) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((item) => rightSet.has(item)).length;
  return overlap / left.length;
}

function termFrequency(tokens = []) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function cosineSimilarity(leftText = '', rightText = '') {
  const left = termFrequency(tokenize(leftText));
  const right = termFrequency(tokenize(rightText));
  if (!left.size || !right.size) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const count of left.values()) {
    leftNorm += count * count;
  }
  for (const count of right.values()) {
    rightNorm += count * count;
  }
  for (const [token, count] of left.entries()) {
    dot += count * (right.get(token) || 0);
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

// Sentence boundaries must not fire inside dotted abbreviations: a lead that
// opens "The U.S. Energy Information Administration reported" is one sentence,
// and cutting it at "U.S." would leave nothing for the template comparison.
const PROTECTED_PERIOD = '\uE000';
const DOTTED_ABBREVIATION = /\b(?:[A-Za-z]\.){2,}(?!\w)/g;
const TITLE_ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Inc|Co|Ltd|Corp|No|vs)\.(?=\s)/g;

export function firstSentenceOfParagraph(paragraph = '') {
  const protectedText = String(paragraph || '')
    .replace(DOTTED_ABBREVIATION, (match) => match.replaceAll('.', PROTECTED_PERIOD))
    .replace(TITLE_ABBREVIATION, (match) => match.replace('.', PROTECTED_PERIOD));
  const first = protectedText.split(/(?<=[.!?])\s+/)[0] || '';
  return first.replaceAll(PROTECTED_PERIOD, '.').trim();
}

// The first sentence of the first non-heading paragraph: the opening device.
export function leadSentence(body = '') {
  const firstParagraph = normalizeEditorialParagraphs(body).find((paragraph) => !isHeadingLine(paragraph));
  if (!firstParagraph) return '';
  return firstSentenceOfParagraph(firstParagraph);
}

function leadTokens(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(Boolean);
}

// Keeps the frame words of a sentence in order and collapses each run of
// content words into a single placeholder, so "I track data center capacity
// the way most people track chip supply" and "I track infrastructure
// constraints the way most analysts track model benchmarks" share the skeleton
// "i _ the way most _".
export function leadTemplateSkeleton(sentence = '') {
  const skeleton = [];
  let placeholderOpen = false;
  for (const token of leadTokens(sentence)) {
    if (LEAD_FRAME_TOKENS.has(token)) {
      skeleton.push(token);
      placeholderOpen = false;
    } else if (!placeholderOpen) {
      skeleton.push('_');
      placeholderOpen = true;
    }
  }
  return skeleton;
}

function frameTokenCount(skeleton = []) {
  return skeleton.filter((token) => token !== '_').length;
}

// Longest-common-subsequence ratio between two lead skeletons, 0..1. Returns 0
// when either skeleton has too few frame words to describe a construction.
export function leadTemplateSimilarity(leftSentence = '', rightSentence = '') {
  const left = leadTemplateSkeleton(leftSentence);
  const right = leadTemplateSkeleton(rightSentence);
  if (frameTokenCount(left) < LEAD_TEMPLATE_MIN_FRAME_TOKENS) return 0;
  if (frameTokenCount(right) < LEAD_TEMPLATE_MIN_FRAME_TOKENS) return 0;
  return sequenceSimilarity(left, right);
}

function conclusion(article = {}) {
  const paragraphs = normalizeEditorialParagraphs(articleBody(article))
    .filter((paragraph) => paragraph.length >= 45);
  return paragraphs[paragraphs.length - 1] || '';
}

function bannedPhraseCounts(article = {}, recentWindow = []) {
  return {
    draft: bannedPhraseMatches(articleBody(article), REPETITION_BANNED_PHRASES),
    recent: bannedPhraseMatches(
      recentWindow.map((item) => articleBody(item)).join('\n\n'),
      REPETITION_BANNED_PHRASES
    ),
  };
}

function publishedRecentArticles(records = [], currentId = '') {
  return records
    .filter((record) => record?.id && record.id !== currentId)
    .filter(hasPublishedArticlePage)
    .filter((record) => record.archiveOnly !== true)
    .filter((record) => articleBody(record))
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, RECENT_ARTICLE_LIMIT);
}

function blueprintRepetition(article = {}, recent = []) {
  const blueprintKey = (record = {}) => {
    if (record.generation_version === 'narrative_dna_v1' || record.expertLensFull?.generation_version === 'narrative_dna_v1') {
      return record.narrative_dna?.story_archetype_id || record.expertLensFull?.narrative_dna?.story_archetype_id || '';
    }
    return normalizeBlueprintId(
      record.article_blueprint || record.articleBlueprint?.id || record.expertLensFull?.blueprintId
    );
  };
  const selected = blueprintKey(article);
  if (!selected) return 0;

  let count = 1;
  for (const record of recent) {
    const recentBlueprint = blueprintKey(record);
    if (recentBlueprint !== selected) break;
    count += 1;
  }
  return count;
}

function maxByRecent(article, recent, scoreFn) {
  return recent.reduce((max, record) => Math.max(max, scoreFn(record)), 0);
}

export function analyzeArticleRepetition(article = {}, recentRecords = []) {
  const recent = publishedRecentArticles(recentRecords, article.id);
  const body = articleBody(article);
  const sentences = splitSentences(body);
  const paragraphs = splitParagraphs(body);
  const recentSentences = new Set(recent.flatMap((record) => splitSentences(articleBody(record))));
  const recentParagraphs = new Set(recent.flatMap((record) => splitParagraphs(articleBody(record))));
  const repeatedSentences = sentences.filter((sentence) => recentSentences.has(sentence));
  const repeatedParagraphs = paragraphs.filter((paragraph) => recentParagraphs.has(paragraph));
  const headings = headingSequence(article);
  const draftNgrams = ngrams(tokenize(body));
  const draftConclusion = conclusion(article);
  const draftLead = leadSentence(body);
  const recentWindow = recent.slice(0, BANNED_PHRASE_WINDOW - 1);
  const bannedCounts = bannedPhraseCounts(article, recentWindow);
  const repeatedBannedPhrases = Object.entries(bannedCounts.draft)
    .filter(([phrase, count]) => count > 0 || (bannedCounts.recent[phrase] || 0) > 0)
    .map(([phrase]) => phrase);

  const metrics = {
    compared_article_count: recent.length,
    repeated_sentence_ratio: sentences.length ? repeatedSentences.length / sentences.length : 0,
    repeated_paragraph_ratio: paragraphs.length ? repeatedParagraphs.length / paragraphs.length : 0,
    heading_sequence_similarity: maxByRecent(article, recent, (record) => sequenceSimilarity(headings, headingSequence(record))),
    banned_phrase_count: Object.values(bannedCounts.draft).reduce((sum, count) => sum + count, 0),
    banned_phrase_counts: bannedCounts.draft,
    recent_banned_phrase_counts: bannedCounts.recent,
    ngram_overlap: maxByRecent(article, recent, (record) => setOverlapRatio(draftNgrams, ngrams(tokenize(articleBody(record))))),
    blueprint_repetition: blueprintRepetition(article, recent),
    conclusion_similarity: maxByRecent(article, recent, (record) => cosineSimilarity(draftConclusion, conclusion(record))),
    lead_template_similarity: maxByRecent(article, recent, (record) => leadTemplateSimilarity(draftLead, leadSentence(articleBody(record)))),
  };

  const reasons = [];
  if (metrics.repeated_sentence_ratio > REPETITION_SENTENCE_RATIO_THRESHOLD) {
    reasons.push(`repeated_sentence_ratio>${REPETITION_SENTENCE_RATIO_THRESHOLD}`);
  }
  if (repeatedBannedPhrases.length) {
    reasons.push(`banned_phrase:${repeatedBannedPhrases.join('|')}`);
  }
  if (metrics.heading_sequence_similarity > HEADING_SEQUENCE_SIMILARITY_THRESHOLD) {
    reasons.push(`heading_sequence_similarity>${HEADING_SEQUENCE_SIMILARITY_THRESHOLD}`);
  }
  if (metrics.conclusion_similarity > CONCLUSION_SIMILARITY_THRESHOLD) {
    reasons.push(`conclusion_similarity>${CONCLUSION_SIMILARITY_THRESHOLD}`);
  }
  if (metrics.lead_template_similarity > LEAD_TEMPLATE_SIMILARITY_THRESHOLD) {
    reasons.push(`lead_template_similarity>${LEAD_TEMPLATE_SIMILARITY_THRESHOLD}`);
  }
  if (metrics.blueprint_repetition > 2) {
    reasons.push('blueprint_repetition>2');
  }

  return {
    ...metrics,
    repeated_sentence_count: repeatedSentences.length,
    repeated_paragraph_count: repeatedParagraphs.length,
    heading_sequence: headings,
    lead_template_skeleton: leadTemplateSkeleton(draftLead).join(' '),
    blocked: reasons.length > 0,
    reasons,
  };
}

export function splitByRepetitionGate(articles = [], recentRecords = []) {
  const passed = [];
  const blocked = [];
  const rollingRecent = [...recentRecords];

  for (const article of articles) {
    const repetition = analyzeArticleRepetition(article, rollingRecent);
    const annotated = {
      ...article,
      repetition_check: repetition,
      repetition_blocked: repetition.blocked,
      repetition_block_reasons: repetition.reasons,
    };

    if (repetition.blocked) {
      blocked.push({
        ...annotated,
        articlePagePublished: false,
        homepagePublished: false,
        archiveOnly: true,
        archiveOnlyReason: repetition.reasons.join('; ') || 'repetition_gate_blocked',
      });
      continue;
    }

    passed.push(annotated);
    rollingRecent.unshift(annotated);
  }

  return { passed, blocked };
}
