import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeExtractionQuality, ARTICLE_PAGE_QUALITY_THRESHOLD } from './lib/quality-gate.mjs';
import {
  FULL_MEMO_RELEVANCE_THRESHOLD,
  SIGNAL_CARD_RELEVANCE_THRESHOLD,
  classifyInfrastructureRelevance,
} from './lib/relevance-classifier.mjs';
import { analyzeArticleRepetition, REPETITION_BANNED_PHRASES } from './lib/repetition-detector.mjs';
import { ARTICLE_BLUEPRINTS, normalizeBlueprintId } from './lib/article-blueprints.mjs';
import {
  articleHasExpertInsight,
  expertInsightUsageScore,
  extractExpertInsight,
} from './lib/expert-insight-engine.mjs';
import { classifyTaxonomy } from './lib/taxonomy.mjs';
import { containsTemplateLanguage, normalizeEditorialParagraphs } from './lib/editorial-humanizer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LATEST_PATH = path.join(ROOT, 'src/data/latest-news.json');
const ARCHIVE_PATH = path.join(ROOT, 'src/data/archived-news.json');
const REPORT_PATH = path.join(ROOT, 'docs/eval-baseline-report.md');
const MIN_EVAL_ARTICLES = 50;
const EVAL_LIMIT = Number(process.env.EVAL_ARTICLE_LIMIT || MIN_EVAL_ARTICLES);

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

async function readJson(filePath, fallback = []) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function articleBody(article = {}) {
  return article.expertLensFull?.finalArticleBody || article.finalArticleBody || article.articleText || article.summary || '';
}

function sourceText(article = {}) {
  return [
    article.title,
    article.snippet,
    article.contentText,
    article.articleText,
    article.summary,
    article.insight,
  ].filter(Boolean).join(' ');
}

function generatedText(article = {}) {
  return [
    article.expertLensFull?.finalHeadline,
    article.expertLensFull?.metaDescription,
    article.expertLensFull?.thesis,
    article.expertLensFull?.whatHappened,
    article.expertLensFull?.whyThisMatters,
    article.expertLensFull?.marketMissing,
    article.expertLensFull?.investors,
    article.expertLensFull?.operators,
    article.expertLensFull?.hyperscalers,
    article.expertLensFull?.watchNext,
    articleBody(article),
  ].filter(Boolean).join(' ');
}

function normalizeWords(text = '') {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'about', 'after', 'before',
    'will', 'are', 'was', 'were', 'has', 'have', 'its', 'their', 'they', 'you', 'your', 'our', 'but',
    'not', 'can', 'more', 'than', 'what', 'when', 'where', 'who', 'why', 'how', 'said', 'says',
  ]);
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stop.has(word));
}

function overlapRatio(left = [], right = []) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length / left.length;
}

function extractNumbers(text = '') {
  return [...String(text).matchAll(/\b\d+(?:[.,]\d+)?\s?(?:%|percent|MW|GW|kW|billion|million|trillion|years?|months?|days?|GPUs?|chips?|servers?|racks?)?\b/gi)]
    .map((match) => match[0].toLowerCase().replace(/\s+/g, ' ').trim());
}

function countBannedPhrases(text = '') {
  const counts = {};
  for (const phrase of REPETITION_BANNED_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = (text.match(new RegExp(escaped, 'gi')) || []).length;
    if (count) counts[phrase] = count;
  }
  return counts;
}

function dedupeArticles(articles = []) {
  const map = new Map();
  for (const article of articles) {
    if (!article?.id) continue;
    if (!map.has(article.id)) {
      map.set(article.id, article);
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

function sourceFidelityEval(article = {}) {
  const source = sourceText(article);
  const generated = generatedText(article);
  const sourceWords = normalizeWords(source);
  const generatedWords = normalizeWords(generated);
  const sourceNumbers = new Set(extractNumbers(source));
  const generatedNumbers = extractNumbers(generated);
  const unsupportedNumbers = generatedNumbers.filter((number) => !sourceNumbers.has(number));
  const overlap = overlapRatio(generatedWords, sourceWords);
  const numericPenalty = generatedNumbers.length ? unsupportedNumbers.length / generatedNumbers.length : 0;
  const score = clamp(overlap * 1.25 - numericPenalty * 0.35);
  return {
    score,
    pass: score >= 0.55 && unsupportedNumbers.length <= 2,
    details: { overlap, unsupportedNumbers },
  };
}

function extractionQualityEval(article = {}) {
  const metrics = article.extraction_qa || analyzeExtractionQuality({
    title: article.title,
    articleText: article.articleText || article.contentText || article.snippet || '',
    fallbackSnippet: article.snippet || '',
    sourceUrl: article.sourceUrl || article.url,
    sourceDomainAdapter: article.source_domain_adapter || 'historical_snapshot',
  });
  const score = Number(article.extraction_quality_score ?? metrics.extraction_quality_score ?? 0);
  return {
    score: clamp(score),
    pass: score >= ARTICLE_PAGE_QUALITY_THRESHOLD || article.articlePagePublished === false,
    details: metrics,
  };
}

function infrastructureRelevanceEval(article = {}) {
  const relevance = article.infrastructure_relevance || classifyInfrastructureRelevance(article);
  const score = Number(article.infrastructure_relevance_score ?? relevance.infrastructure_relevance_score ?? 0);
  return {
    score: clamp(score),
    pass: score >= SIGNAL_CARD_RELEVANCE_THRESHOLD || article.homepagePublished === false || article.archiveOnly === true,
    details: relevance,
  };
}

function insightSpecificityEval(article = {}) {
  const insight = article.expert_insight || article.expertInsight || extractExpertInsight(article);
  const usage = expertInsightUsageScore(articleBody(article), insight);
  const fieldCoverage = [
    Array.isArray(insight.concrete_facts) && insight.concrete_facts.length > 0,
    Array.isArray(insight.named_companies) && insight.named_companies.length > 0,
    Boolean(insight.infrastructure_layer),
    Boolean(insight.bottleneck_type),
    Boolean(insight.who_gains_leverage),
    Boolean(insight.who_takes_execution_risk),
    Boolean(insight.timing_dependency),
    Boolean(insight.counterargument),
    Boolean(insight.next_observable_signal),
  ].filter(Boolean).length / 9;
  const score = clamp(fieldCoverage * 0.7 + usage * 0.3);
  return {
    score,
    pass: article.articlePagePublished === false || (articleHasExpertInsight({ ...article, expert_insight: insight }) && usage >= 0.45),
    details: { fieldCoverage, usage, missing: insight.expert_insight_missing_fields || [] },
  };
}

function repetitionEval(article = {}, recent = []) {
  const repetition = analyzeArticleRepetition(article, recent);
  const score = clamp(
    1 -
      repetition.repeated_sentence_ratio * 2 -
      repetition.repeated_paragraph_ratio * 2 -
      Math.max(0, repetition.heading_sequence_similarity - 0.4) -
      Math.max(0, repetition.conclusion_similarity - 0.4) -
      Math.min(0.4, repetition.banned_phrase_count * 0.08)
  );
  return {
    score,
    pass: !repetition.blocked || article.articlePagePublished === false,
    details: repetition,
  };
}

function taxonomyAccuracyEval(article = {}) {
  const expected = classifyTaxonomy(article);
  const matches = [
    article.primary_category || article.category,
    article.infrastructure_layer,
    article.article_type,
    article.region,
  ];
  const expectedValues = [
    expected.primary_category,
    expected.infrastructure_layer,
    expected.article_type,
    expected.region,
  ];
  const matchCount = matches.filter((value, index) => value && value === expectedValues[index]).length;
  const score = matchCount / expectedValues.length;
  return {
    score,
    pass: score >= 0.5,
    details: { stored: matches, expected: expectedValues },
  };
}

function seoHelpfulnessEval(article = {}) {
  const headline = article.expertLensFull?.finalHeadline || article.title || '';
  const meta = article.expertLensFull?.metaDescription || article.summary || '';
  const body = articleBody(article);
  const headlineLength = headline.length;
  const metaLength = meta.length;
  const checks = [
    headlineLength >= 35 && headlineLength <= 85,
    metaLength >= 80 && metaLength <= 170,
    /\b(data center|cloud|power|grid|gpu|chip|semiconductor|capacity|cooling|infrastructure|ai)\b/i.test(`${headline} ${meta}`),
    !/\b(update|latest|what to watch|bottleneck behind)\b$/i.test(headline.trim()),
    normalizeEditorialParagraphs(body).length >= 5,
  ];
  const score = checks.filter(Boolean).length / checks.length;
  return { score, pass: score >= 0.7, details: { headlineLength, metaLength, checks } };
}

function blueprintDiversityEval(article = {}, recent = []) {
  const blueprint = normalizeBlueprintId(
    article.article_blueprint || article.articleBlueprint?.id || article.expertLensFull?.blueprintId
  );
  if (!blueprint) {
    return { score: 0.35, pass: article.articlePagePublished === false, details: { blueprint: null, runLength: 0 } };
  }
  let runLength = 1;
  for (const item of recent) {
    const previous = normalizeBlueprintId(item.article_blueprint || item.articleBlueprint?.id || item.expertLensFull?.blueprintId);
    if (previous !== blueprint) break;
    runLength += 1;
  }
  const recentBlueprints = [blueprint, ...recent.slice(0, 9).map((item) => normalizeBlueprintId(
    item.article_blueprint || item.articleBlueprint?.id || item.expertLensFull?.blueprintId
  )).filter(Boolean)];
  const diversity = new Set(recentBlueprints).size / Math.min(ARTICLE_BLUEPRINTS.length, Math.max(1, recentBlueprints.length));
  const score = clamp((runLength <= 2 ? 0.65 : 0.2) + diversity * 0.35);
  return { score, pass: runLength <= 2, details: { blueprint, runLength, diversity } };
}

function genericLanguageEval(article = {}) {
  const text = generatedText(article);
  const counts = countBannedPhrases(text);
  const bannedCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const templateDetected = containsTemplateLanguage(text);
  const genericTerms = [
    /\bAI infrastructure execution risk\b/gi,
    /\bheadline demand\b/gi,
    /\bcapacity planning\b/gi,
    /\boperators and investors\b/gi,
    /\bpractical effect\b/gi,
  ];
  const genericCount = genericTerms.reduce((sum, pattern) => sum + (text.match(pattern) || []).length, 0);
  const score = clamp(1 - bannedCount * 0.18 - genericCount * 0.08 - (templateDetected ? 0.2 : 0));
  return { score, pass: score >= 0.78, details: { bannedCount, genericCount, counts, templateDetected } };
}

function publishDecisionEval(article = {}, evals = {}) {
  const relevanceScore = evals.infrastructure_relevance.score;
  const extractionScore = evals.extraction_quality.score;
  const shouldPublish =
    relevanceScore >= FULL_MEMO_RELEVANCE_THRESHOLD &&
    extractionScore >= ARTICLE_PAGE_QUALITY_THRESHOLD &&
    evals.insight_specificity.pass &&
    evals.repetition.pass &&
    evals.generic_language_penalty.pass;
  const didPublish = article.articlePagePublished !== false && article.archiveOnly !== true;
  return {
    score: shouldPublish === didPublish ? 1 : 0,
    pass: shouldPublish === didPublish,
    details: { shouldPublish, didPublish },
  };
}

function evaluateArticle(article = {}, recent = []) {
  const evals = {
    source_fidelity: sourceFidelityEval(article),
    extraction_quality: extractionQualityEval(article),
    infrastructure_relevance: infrastructureRelevanceEval(article),
    insight_specificity: insightSpecificityEval(article),
    repetition: repetitionEval(article, recent),
    taxonomy_accuracy: taxonomyAccuracyEval(article),
    seo_helpfulness: seoHelpfulnessEval(article),
    article_blueprint_diversity: blueprintDiversityEval(article, recent),
    generic_language_penalty: genericLanguageEval(article),
  };
  evals.publish_decision_accuracy = publishDecisionEval(article, evals);
  const score = Object.values(evals).reduce((sum, item) => sum + item.score, 0) / Object.values(evals).length;
  return {
    id: article.id,
    title: article.title,
    source: article.source,
    publishedAt: article.publishedAt,
    score,
    pass: Object.values(evals).every((item) => item.pass),
    evals,
  };
}

function summarize(results = []) {
  const names = Object.keys(results[0]?.evals || {});
  return names.map((name) => {
    const items = results.map((result) => result.evals[name]);
    const avg = items.reduce((sum, item) => sum + item.score, 0) / items.length;
    const passCount = items.filter((item) => item.pass).length;
    return {
      name,
      avg,
      passCount,
      failCount: items.length - passCount,
      passRate: passCount / items.length,
    };
  });
}

function formatPct(value) {
  return `${Math.round(value * 100)}%`;
}

function formatScore(value) {
  return Number(value).toFixed(2);
}

function escapePipe(text = '') {
  return String(text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function failureReason(result = {}) {
  return Object.entries(result.evals)
    .filter(([, evalResult]) => !evalResult.pass)
    .map(([name]) => name)
    .join(', ');
}

function reportMarkdown({ results, summary, articles }) {
  const avgScore = results.reduce((sum, result) => sum + result.score, 0) / results.length;
  const passCount = results.filter((result) => result.pass).length;
  const lowest = [...results].sort((a, b) => a.score - b.score).slice(0, 10);
  const best = [...results].sort((a, b) => b.score - a.score).slice(0, 5);
  const evaluatedAt = new Date().toISOString();

  return [
    '# Compute Current Article Generation Eval Baseline',
    '',
    `Generated: ${evaluatedAt}`,
    '',
    `Evaluated ${results.length} historical articles from \`src/data/latest-news.json\` and \`src/data/archived-news.json\`. The available corpus contains ${articles.length} deduped records; this run uses the newest ${results.length}.`,
    '',
    '## Summary',
    '',
    `- Overall average score: ${formatScore(avgScore)}`,
    `- Articles passing every eval: ${passCount}/${results.length} (${formatPct(passCount / results.length)})`,
    `- Minimum requested sample size: ${MIN_EVAL_ARTICLES}`,
    '',
    '## Eval Results',
    '',
    '| Eval | Avg Score | Pass Rate | Failures |',
    '| --- | ---: | ---: | ---: |',
    ...summary.map((item) =>
      `| ${item.name.replace(/_/g, ' ')} | ${formatScore(item.avg)} | ${formatPct(item.passRate)} | ${item.failCount} |`
    ),
    '',
    '## Lowest Scoring Articles',
    '',
    '| Score | Source | Title | Failed Evals |',
    '| ---: | --- | --- | --- |',
    ...lowest.map((result) =>
      `| ${formatScore(result.score)} | ${escapePipe(result.source)} | ${escapePipe(result.title)} | ${escapePipe(failureReason(result))} |`
    ),
    '',
    '## Strongest Articles',
    '',
    '| Score | Source | Title |',
    '| ---: | --- | --- |',
    ...best.map((result) =>
      `| ${formatScore(result.score)} | ${escapePipe(result.source)} | ${escapePipe(result.title)} |`
    ),
    '',
    '## Method',
    '',
    '1. Source fidelity: lexical overlap between generated article fields and source text, with a penalty for generated numbers not present in source text.',
    '2. Extraction quality: persisted extraction QA when available, otherwise a deterministic extraction-quality recomputation over stored article text/snippet.',
    '3. Infrastructure relevance: persisted classifier score when available, otherwise deterministic relevance classification.',
    '4. Insight specificity: expert insight field coverage plus whether generated body uses extracted insight fields.',
    '5. Repetition: existing repetition detector against prior historical articles in chronological order.',
    '6. Taxonomy accuracy: stored taxonomy compared with deterministic taxonomy classification.',
    '7. SEO helpfulness: headline/meta length, infrastructure terms, and body depth checks.',
    '8. Article blueprint diversity: selected blueprint presence, rolling run length, and recent blueprint variety.',
    '9. Generic language penalty: banned phrase and generic scaffold detection.',
    '10. Publish/no-publish decision accuracy: current policy oracle compared with stored publish state.',
    '',
    '## Baseline Notes',
    '',
    '- Several historical records predate extraction QA, expert insight fields, and article blueprint persistence; those gaps are intentionally visible in this baseline.',
    '- This is a deterministic local eval suite, not a model-graded eval. It is designed for regression tracking and gate calibration before publishing.',
    '- The publish-decision eval uses the current policy as the oracle: relevance >= 0.75, extraction quality >= 0.8, complete insight specificity, repetition pass, and generic-language pass.',
    '',
  ].join('\n');
}

async function main() {
  const latest = await readJson(LATEST_PATH, []);
  const archive = await readJson(ARCHIVE_PATH, []);
  const articles = dedupeArticles([...latest, ...archive]);
  if (articles.length < MIN_EVAL_ARTICLES) {
    throw new Error(`Need at least ${MIN_EVAL_ARTICLES} historical articles; found ${articles.length}`);
  }

  const sample = articles.slice(0, Math.max(MIN_EVAL_ARTICLES, EVAL_LIMIT));
  const chronological = [...sample].sort((a, b) => new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0));
  const recent = [];
  const byId = new Map();

  for (const article of chronological) {
    const result = evaluateArticle(article, recent.slice(-50));
    byId.set(article.id, result);
    if (article.articlePagePublished !== false && article.archiveOnly !== true) {
      recent.push(article);
    }
  }

  const results = sample.map((article) => byId.get(article.id));
  const summary = summarize(results);
  const markdown = reportMarkdown({ results, summary, articles });
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, markdown);

  console.log(`[eval] evaluated ${results.length} articles`);
  console.log(`[eval] wrote ${path.relative(ROOT, REPORT_PATH)}`);
  for (const item of summary) {
    console.log(`[eval] ${item.name}: avg=${formatScore(item.avg)} pass=${item.passCount}/${results.length}`);
  }
}

main().catch((error) => {
  console.error('[eval] failed:', error);
  process.exit(1);
});
