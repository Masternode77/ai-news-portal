import {
  buildHumanizedArticleBody,
  containsTemplateLanguage,
  normalizeEditorialParagraphs,
  normalizeEditorialVoice,
} from './editorial-humanizer.mjs';
import { hasBannedPhrase } from './banned-phrases.mjs';
import { sanitizeGeneratedText, truncate } from './normalize.mjs';

export const ARTICLE_BLUEPRINTS = [
  {
    id: 'constraint-ledger',
    name: 'Constraint Ledger',
    sectionHeadings: ['Change', 'Infrastructure Read', 'Exposed Edges', 'Decision Point'],
    paragraphRhythm: [1, 2, 2, 1],
    targetParagraphs: 6,
    minChars: 1200,
    maxChars: 1900,
    prompt:
      'Open with the reported change, then move into operating constraints, exposed stakeholders, and the decision point readers should monitor.',
  },
  {
    id: 'stakeholder-map',
    name: 'Stakeholder Map',
    sectionHeadings: ['The Move', 'Who Benefits', 'Who Is Exposed', 'Bottleneck to Watch'],
    paragraphRhythm: [2, 1, 1, 2],
    targetParagraphs: 6,
    minChars: 1000,
    maxChars: 1650,
    prompt:
      'Frame the item through beneficiaries and exposed parties, with a tighter middle and a longer closing watch section.',
  },
  {
    id: 'capacity-chain',
    name: 'Capacity Chain',
    sectionHeadings: ['Signal', 'Capacity Chain', 'Commercial Stakes', 'Next Constraint'],
    paragraphRhythm: [1, 3, 1, 2],
    targetParagraphs: 7,
    minChars: 1400,
    maxChars: 2200,
    prompt:
      'Treat the article as a chain of capacity dependencies, with the longest section on physical, cloud, power, chip, or deployment constraints.',
  },
  {
    id: 'capital-operator-brief',
    name: 'Capital Operator Brief',
    sectionHeadings: ['Report', 'Capital Read', 'Operator Read', 'Watch Item'],
    paragraphRhythm: [1, 1, 2, 1],
    targetParagraphs: 5,
    minChars: 900,
    maxChars: 1500,
    prompt:
      'Use a compact operator-investor rhythm: one paragraph of reported change, one capital implication, two operating implications, and one watch item.',
  },
];

const BLUEPRINT_BY_ID = new Map(ARTICLE_BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint]));

function stableIndex(value = '', modulo = ARTICLE_BLUEPRINTS.length) {
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return modulo ? hash % modulo : 0;
}

export function normalizeBlueprintId(value = '') {
  const id = String(value || '').trim();
  return BLUEPRINT_BY_ID.has(id) ? id : '';
}

export function getArticleBlueprint(value = '') {
  return BLUEPRINT_BY_ID.get(normalizeBlueprintId(value)) || null;
}

export function blueprintSnapshot(blueprint) {
  const selected = blueprint || ARTICLE_BLUEPRINTS[0];
  return {
    id: selected.id,
    name: selected.name,
    sectionHeadings: selected.sectionHeadings,
    paragraphRhythm: selected.paragraphRhythm,
    targetParagraphs: selected.targetParagraphs,
    minChars: selected.minChars,
    maxChars: selected.maxChars,
  };
}

export function blueprintHistoryFromRecords(records = []) {
  return [...records]
    .filter((record) => record?.article_blueprint || record?.articleBlueprint?.id || record?.expertLensFull?.blueprintId)
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .map((record) =>
      normalizeBlueprintId(record.article_blueprint || record.articleBlueprint?.id || record.expertLensFull?.blueprintId)
    )
    .filter(Boolean);
}

export function selectArticleBlueprint(article = {}, recentBlueprintIds = []) {
  const cleanHistory = recentBlueprintIds.map(normalizeBlueprintId).filter(Boolean);
  let candidates = ARTICLE_BLUEPRINTS;

  if (cleanHistory.length >= 2 && cleanHistory[0] === cleanHistory[1]) {
    candidates = ARTICLE_BLUEPRINTS.filter((blueprint) => blueprint.id !== cleanHistory[0]);
  }

  const seed = [
    article.id,
    article.title,
    article.source,
    article.primary_category || article.category,
    article.publishedAt,
  ].filter(Boolean).join('|');

  return candidates[stableIndex(seed, candidates.length)] || ARTICLE_BLUEPRINTS[0];
}

export function blueprintPrompt(blueprint) {
  const selected = blueprint || ARTICLE_BLUEPRINTS[0];
  return [
    `Use article blueprint "${selected.name}" (${selected.id}).`,
    `Reader-facing section headings must be exactly: ${selected.sectionHeadings.join(' | ')}.`,
    `Paragraph rhythm by section must be: ${selected.paragraphRhythm.join(' / ')} paragraphs.`,
    `Target ${selected.targetParagraphs} body paragraphs, excluding heading lines.`,
    `Keep finalArticleBody between ${selected.minChars} and ${selected.maxChars} characters unless source complexity requires a modest exception.`,
    selected.prompt,
  ].join(' ');
}

export function bodyUsesBlueprint(body = '', blueprint = ARTICLE_BLUEPRINTS[0]) {
  const selected = blueprint || ARTICLE_BLUEPRINTS[0];
  const lines = normalizeEditorialParagraphs(body);
  if (!lines.length) return false;

  const headingPositions = selected.sectionHeadings.map((heading) => lines.findIndex((line) => line === heading));
  if (headingPositions.some((position) => position < 0)) return false;

  for (let index = 1; index < headingPositions.length; index += 1) {
    if (headingPositions[index] <= headingPositions[index - 1]) return false;
  }

  return true;
}

function bodyParagraphCandidates(article = {}, sections = {}) {
  const insight = article.expert_insight || article.expertInsight || {};
  const facts = Array.isArray(insight.concrete_facts) ? insight.concrete_facts.filter(Boolean) : [];
  const companies = Array.isArray(insight.named_companies) ? insight.named_companies.filter(Boolean) : [];
  const insightParagraphs = [
    facts.length
      ? `${companies.length ? `${companies.slice(0, 3).join(', ')} sit at the center of the source material. ` : ''}${facts[0]}`
      : '',
    insight.bottleneck_type
      ? `The specific bottleneck is ${String(insight.bottleneck_type).replace(/_/g, ' ')}, in the ${insight.infrastructure_layer || 'infrastructure'} layer. ${insight.timing_dependency || ''}`
      : '',
    insight.who_gains_leverage
      ? `Leverage moves toward ${insight.who_gains_leverage}. Execution risk sits with ${insight.who_takes_execution_risk || 'the parties responsible for converting the announcement into operating capacity'}.`
      : '',
    insight.counterargument
      ? `The counterargument is narrower: ${insight.counterargument}`
      : '',
    insight.next_observable_signal
      ? `The next observable signal is ${insight.next_observable_signal}.`
      : '',
    ...facts.slice(1, 3),
  ];
  const base = normalizeEditorialParagraphs(buildHumanizedArticleBody(article, sections));
  const additions = [
    ...insightParagraphs,
    sections.whatHappened,
    sections.whyThisMatters,
    sections.marketMissing,
    sections.investors,
    sections.operators,
    sections.hyperscalers,
    sections.watchNext,
  ]
    .map((value) => normalizeEditorialVoice(sanitizeGeneratedText(value || '')))
    .filter(Boolean);

  const seen = new Set();
  return [...additions, ...base]
    .map((paragraph) => normalizeEditorialVoice(paragraph))
    .filter((paragraph) => {
      if (!paragraph || containsTemplateLanguage(paragraph) || hasBannedPhrase(paragraph)) return false;
      const key = paragraph.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function blueprintFallbackBody(article = {}, sections = {}, blueprint = ARTICLE_BLUEPRINTS[0]) {
  const selected = blueprint || ARTICLE_BLUEPRINTS[0];
  const paragraphs = bodyParagraphCandidates(article, sections);
  const bodyLines = [];
  let paragraphIndex = 0;

  selected.sectionHeadings.forEach((heading, headingIndex) => {
    bodyLines.push(heading);
    const count = selected.paragraphRhythm[headingIndex] || 1;
    for (let offset = 0; offset < count; offset += 1) {
      const paragraph = paragraphs[paragraphIndex] || paragraphs[paragraphs.length - 1] || sections.thesis || article.summary || article.title;
      if (paragraph) bodyLines.push(paragraph);
      paragraphIndex += 1;
    }
  });

  let body = bodyLines.filter(Boolean).join('\n\n');
  if (body.length > selected.maxChars + 260) {
    const lines = body.split(/\n\n+/);
    body = lines.map((line) => {
      if (selected.sectionHeadings.includes(line)) return line;
      return truncate(line, 280);
    }).join('\n\n');
  }

  return body;
}
