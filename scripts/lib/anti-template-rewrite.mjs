import { ARTICLE_BLUEPRINTS } from './article-blueprints.mjs';
import { hasBannedPhrase } from './banned-phrases.mjs';
import { buildNarrativeLensFields, extractNarrativeDNA, GENERATION_VERSION } from './narrative-dna.mjs';
import { normalizeEditorialParagraphs } from './editorial-humanizer.mjs';

const RECENT_TEMPLATE_LIMIT = 20;
const KNOWN_HEADINGS = new Set(ARTICLE_BLUEPRINTS.flatMap((blueprint) => blueprint.sectionHeadings));

function articleBody(article = {}) {
  return article.expertLensFull?.finalArticleBody || article.finalArticleBody || article.articleText || article.summary || '';
}

function normalized(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstWords(text = '', count = 12) {
  return normalized(text).split(/\s+/).filter(Boolean).slice(0, count).join(' ');
}

function hookFromArticle(article = {}) {
  return normalizeEditorialParagraphs(articleBody(article)).find((paragraph) => paragraph.length >= 35) || '';
}

function headingSequence(article = {}) {
  return normalizeEditorialParagraphs(articleBody(article)).filter((line) => {
    if (KNOWN_HEADINGS.has(line)) return true;
    if (line.length > 72 || /[.!?]$/.test(line)) return false;
    return /^[A-Z0-9][A-Za-z0-9 &:/+-]+$/.test(line);
  });
}

function paragraphInventory(records = []) {
  return new Set(
    records
      .flatMap((record) => normalizeEditorialParagraphs(articleBody(record)))
      .map(normalized)
      .filter((paragraph) => paragraph.length >= 60)
  );
}

function ngrams(text = '', size = 6) {
  const tokens = normalized(text).split(/\s+/).filter((token) => token.length > 2);
  const grams = new Set();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    grams.add(tokens.slice(index, index + size).join(' '));
  }
  return grams;
}

function recentInventory(recentRecords = []) {
  const recent = [...recentRecords]
    .filter((record) => record?.id && record.articlePagePublished !== false && record.archiveOnly !== true)
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, RECENT_TEMPLATE_LIMIT);

  return {
    recent,
    hooks: recent.map(hookFromArticle).filter(Boolean),
    hookStarts: new Set(recent.map((record) => firstWords(hookFromArticle(record))).filter(Boolean)),
    headings: new Set(recent.map((record) => headingSequence(record).join('|')).filter(Boolean)),
    paragraphs: paragraphInventory(recent),
    ngrams: new Set(recent.flatMap((record) => [...ngrams(articleBody(record))])),
  };
}

function needsRewrite(article = {}, inventory) {
  const body = articleBody(article);
  const hookStart = firstWords(hookFromArticle(article));
  const headings = headingSequence(article).join('|');
  const paragraphs = normalizeEditorialParagraphs(body).map(normalized).filter((paragraph) => paragraph.length >= 60);
  const draftNgrams = ngrams(body);
  const ngramOverlap = [...draftNgrams].filter((gram) => inventory.ngrams.has(gram)).length;
  const ngramRatio = draftNgrams.size ? ngramOverlap / draftNgrams.size : 0;

  return (
    hasBannedPhrase(body) ||
    (hookStart && inventory.hookStarts.has(hookStart)) ||
    (headings && inventory.headings.has(headings)) ||
    paragraphs.some((paragraph) => inventory.paragraphs.has(paragraph)) ||
    ngramRatio > 0.18
  );
}

function rewriteArticle(article = {}, inventory) {
  const narrative = buildNarrativeLensFields(article, { recentHooks: inventory.hooks });
  const full = {
    ...(article.expertLensFull || {}),
    ...narrative,
    version: article.expertLensFull?.version,
    generatedAt: new Date().toISOString(),
    antiTemplateRewrite: true,
  };

  return {
    ...article,
    generation_version: GENERATION_VERSION,
    narrative_dna: full.narrative_dna || extractNarrativeDNA(article),
    dynamic_brief_label: full.dynamicBriefLabel || full.narrative_dna?.brief_label || null,
    expertLensFull: full,
    expertLensShort: full.thesis,
    expertLens: full.thesis,
    anti_template_rewrite: true,
  };
}

export function applyAntiTemplateRewrite(articles = [], recentRecords = []) {
  const inventory = recentInventory(recentRecords);
  const output = [];
  const rollingRecent = [...inventory.recent];

  for (const article of articles) {
    const next = needsRewrite(article, recentInventory(rollingRecent))
      ? rewriteArticle(article, recentInventory(rollingRecent))
      : article;
    output.push(next);
    if (next.articlePagePublished !== false && next.archiveOnly !== true) {
      rollingRecent.unshift(next);
    }
  }

  return output;
}
