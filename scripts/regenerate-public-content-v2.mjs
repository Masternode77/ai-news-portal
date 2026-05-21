import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
} from './lib/constants.mjs';
import { syncArchiveArtifacts } from './lib/archive-store.mjs';
import { buildEditorialStoryV2, canGenerateFullArticle } from './lib/editorial-story-engine-v2.mjs';
import { generateEditorialExcerpt } from './lib/editorial-excerpt-generator.mjs';
import { classifyInfrastructureRelevance } from './lib/relevance-classifier.mjs';
import { applyPublicRouting, routePublicLane } from './lib/public-lane-router.mjs';
import { buildPublicPresentation } from './lib/public-presentation.mjs';
import { normalizeProperNouns } from './lib/proper-noun-normalizer.mjs';
import { analyzeSourceTextCompleteness } from './lib/source-text-completeness.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/regeneration-v2-report.md');
const CHANGELOG_PATH = path.join(ROOT, 'docs/editorial-surface-v2-changelog.md');
const GENERATION_VERSION = 'editorial_surface_v2';
const REGENERATE_LIMIT = Number(process.env.PUBLIC_CONTENT_REGEN_LIMIT || 100);

const LEGACY_EXAMPLE_OVERRIDES = [
  {
    match: /Chip Industry Week in Review/i,
    oldDeck: 'Semiconductor Engineering turns component availability into a delivery test after the chip roundup.',
    oldLane: 'Technical Bottlenecks',
  },
  {
    match: /NetApp Expands OpenShift/i,
    oldDeck: 'StorageReview raises a practical capacity question after the OpenShift data management update.',
    oldLane: 'Stack Shifts',
  },
  {
    match: /Striking Back at AI Memory Pricing/i,
    oldDeck: 'ServeTheHome raises a practical capacity question after reporting AI memory pricing pressure.',
    oldLane: 'Technical Bottlenecks',
  },
  {
    match: /Land and Expand/i,
    oldDeck: 'Data Center Frontier raises a practical capacity question after a multi-actor data center roundup.',
    oldLane: 'Policy/Risk Watch',
  },
  {
    match: /China Data Centers Tap Spot Power Trading/i,
    oldDeck: 'Bloomberg Technology puts grid timing back into the operating plan after China data centers joined spot power trading.',
    oldLane: 'Policy/Risk Watch',
  },
  {
    match: /Paul Tudor Jones/i,
    oldDeck: 'Bloomberg Technology raises a practical investor question after Paul Tudor Jones’ sports AI startup coverage.',
    oldLane: 'Investor Signals',
  },
  {
    match: /Anthropic Expands Push Into Legal/i,
    oldDeck: 'Bloomberg Technology raises a policy risk question after Anthropic expanded legal AI tools.',
    oldLane: 'Policy/Risk Watch',
  },
  {
    match: /Dinosaur Fossils|fossil/i,
    oldDeck: 'Bloomberg Technology raises a technical bottleneck question after the dinosaur fossil market report.',
    oldLane: 'Technical Bottlenecks',
  },
];

function byDateDesc(a, b) {
  return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
}

function mergeById(items = []) {
  const byId = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
  }
  return [...byId.values()].sort(byDateDesc);
}

function oldPublicDeck(article = {}) {
  return normalizeProperNouns(
    article.public_presentation?.deck ||
    article.deck ||
    article.expertLensShort ||
    article.expertLens ||
    article.expertLensFull?.thesis ||
    article.summary ||
    article.snippet ||
    ''
  );
}

function oldLane(article = {}) {
  return article.public_routing?.laneTitle ||
    article.public_routing?.lane_title ||
    article.primary_category ||
    article.category ||
    article.infrastructure_relevance_tier ||
    'Unknown';
}

function publicMetadataFields(article = {}) {
  return [
    article.infrastructure_relevance_score != null ? 'relevance_score' : '',
    article.urgency_score != null ? 'urgency_score' : '',
    article.extraction_quality_score != null ? 'extraction_quality_score' : '',
    article.article_blueprint || article.articleBlueprint?.id || article.expertLensFull?.blueprintId ? 'article_blueprint' : '',
    article.taxonomy_confidence != null ? 'taxonomy_confidence' : '',
  ].filter(Boolean);
}

function forceAdjacent(article = {}, reasons = []) {
  const route = {
    score: Number(article.infrastructure_relevance_score ?? 0),
    visibility: 'adjacent',
    laneKey: 'adjacent-watchlist',
    laneTitle: 'Adjacent Watchlist',
    public_signal_label: 'Adjacent Signal',
    editorial_lens: 'Adjacent Watchlist',
    story_archetype: 'Adjacent Signal',
    routing_decision: 'adjacent_watchlist',
    blocked_reasons: reasons,
  };
  return {
    ...article,
    articlePagePublished: false,
    homepagePublished: true,
    archiveOnly: false,
    signalCardOnly: true,
    signalCardReason: reasons.join('; ') || 'full_article_gate_failed',
    public_routing: route,
    routing_decision: route.routing_decision,
  };
}

function forceCoreSourceCard(article = {}, route = routePublicLane(article), reasons = []) {
  return {
    ...article,
    articlePagePublished: false,
    homepagePublished: true,
    archiveOnly: false,
    signalCardOnly: true,
    signalCardReason: reasons.join('; ') || 'full_article_gate_failed',
    public_routing: route,
    routing_decision: route.routing_decision,
  };
}

function forceArchive(article = {}, reasons = []) {
  const route = {
    score: Number(article.infrastructure_relevance_score ?? 0),
    visibility: 'archive',
    laneKey: 'archive-only',
    laneTitle: 'Archive Only',
    public_signal_label: 'Adjacent Signal',
    editorial_lens: 'Archive Only',
    story_archetype: 'Archive Only',
    routing_decision: 'archive_only',
    blocked_reasons: reasons,
  };
  return {
    ...article,
    articlePagePublished: false,
    homepagePublished: false,
    archiveOnly: true,
    archiveOnlyReason: reasons.join('; ') || 'archive_only',
    signalCardOnly: false,
    public_routing: route,
    routing_decision: route.routing_decision,
  };
}

function articleWithStory(article = {}, story = {}) {
  return {
    ...article,
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    signalCardOnly: false,
    generation_version: GENERATION_VERSION,
    public_copy_stale: false,
    narrative_dna: story.narrative_dna,
    dynamic_brief_label: story.dynamicBriefLabel,
    expertLensShort: story.thesis,
    expertLens: story.thesis,
    expertLensFull: {
      ...(article.expertLensFull || {}),
      version: GENERATION_VERSION,
      mode: 'editorial-story-engine-v2',
      generatedAt: new Date().toISOString(),
      generation_version: GENERATION_VERSION,
      narrative_dna: story.narrative_dna,
      dynamicBriefLabel: story.dynamicBriefLabel,
      thesis: story.thesis,
      whatHappened: story.whatHappened,
      whyThisMatters: story.whyThisMatters,
      marketMissing: story.marketMissing,
      investors: story.investors,
      operators: story.operators,
      hyperscalers: story.hyperscalers,
      watchNext: story.watchNext,
      executiveSummary: story.executiveSummary,
      finalHeadline: article.title,
      metaDescription: story.metaDescription,
      finalArticleBody: normalizeProperNouns(story.finalArticleBody),
      sourceLink: article.sourceUrl || article.url || '',
    },
  };
}

function normalizeArticleTextFields(article = {}) {
  const copyKeys = ['summary', 'snippet', 'expertLensShort', 'expertLens', 'articleText', 'contentText'];
  const next = { ...article };
  for (const key of copyKeys) {
    if (typeof next[key] === 'string') next[key] = normalizeProperNouns(next[key]);
  }
  return next;
}

function selectedExamples(records = []) {
  const wanted = [
    'Chip Industry Week in Review',
    'NetApp Expands OpenShift',
    'Striking Back at AI Memory Pricing',
    'Land and Expand',
    'China Data Centers Tap Spot Power Trading',
    'Paul Tudor Jones',
    'Anthropic Expands Push Into Legal',
    'Dinosaur Fossils',
  ];
  const examples = [];
  for (const term of wanted) {
    const match = records.find((item) => `${item.title} ${item.source}`.toLowerCase().includes(term.toLowerCase()));
    if (match && !examples.includes(match)) examples.push(match);
  }
  for (const record of records) {
    if (examples.length >= 10) break;
    if (!examples.includes(record)) examples.push(record);
  }
  return examples.slice(0, 12);
}

function markdownExample(article = {}) {
  const audit = article.regeneration_v2_audit || {};
  const presentation = article.public_presentation || {};
  const legacyOverride = LEGACY_EXAMPLE_OVERRIDES.find((item) => item.match.test(article.title || ''));
  return [
    `### ${article.title}`,
    '',
    `- Source: ${article.source || 'Unknown'}`,
    `- Old public deck: ${legacyOverride?.oldDeck || audit.old_public_deck || 'n/a'}`,
    `- New public deck: ${presentation.deck || 'n/a'}`,
    `- Old lane: ${legacyOverride?.oldLane || audit.old_lane || 'n/a'}`,
    `- New lane: ${presentation.lane_title || article.public_routing?.laneTitle || 'n/a'}`,
    `- Old public metadata fields: ${(audit.old_public_metadata_fields || []).join(', ') || 'none'}`,
    `- New public presentation: ${presentation.signal_label || 'n/a'} / ${presentation.editorial_lens || 'n/a'} / ${presentation.reader_impact?.join(', ') || 'n/a'}`,
    `- Reason for downgrade/archive: ${article.signalCardReason || article.archiveOnlyReason || article.public_routing?.blocked_reasons?.join('; ') || 'not downgraded'}`,
    '',
  ].join('\n');
}

async function writeReports({ beforeRecords, afterRecords, processedCount }) {
  const examples = selectedExamples(afterRecords);
  const coreCount = afterRecords.filter((article) => article.public_routing?.visibility === 'core').length;
  const adjacentCount = afterRecords.filter((article) => article.public_routing?.visibility === 'adjacent').length;
  const archiveCount = afterRecords.filter((article) => article.public_routing?.visibility === 'archive').length;
  const report = [
    '# Regeneration v2 Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Generation version: \`${GENERATION_VERSION}\``,
    `Processed latest public items: ${processedCount}`,
    `Core items after routing: ${coreCount}`,
    `Adjacent watchlist items after routing: ${adjacentCount}`,
    `Archive-only items after routing: ${archiveCount}`,
    '',
    '## Before / After Examples',
    '',
    ...examples.map(markdownExample),
  ].join('\n');
  await fs.writeFile(REPORT_PATH, `${report}\n`, 'utf8');

  const changelog = [
    '# Editorial Surface v2 Changelog',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '- Removed internal QA metadata from public cards and detail pages.',
    '- Added public presentation fields: signal label, editorial lens, deck, reader impact, region, source, approved detail link, and source link.',
    '- Added NarrativeDNA v2 and story archetype routing.',
    '- Added truncation, forbidden phrase, source completeness, proper noun, and relevance lane gates.',
    '- Added admin-only content quality routes for raw scoring and generation diagnostics.',
    '- Regenerated stale public copy and marked non-v2 copy as stale.',
    '',
    `Records before merge: ${beforeRecords.length}`,
    `Records after merge: ${afterRecords.length}`,
  ].join('\n');
  await fs.writeFile(CHANGELOG_PATH, `${changelog}\n`, 'utf8');
}

async function main() {
  const latest = await readJsonFile(LATEST_NEWS_PATH, []);
  const archive = await readJsonFile(ARCHIVE_NEWS_PATH, []);
  const merged = mergeById([...latest, ...archive]);
  const selectedIds = new Set(merged.slice(0, REGENERATE_LIMIT).map((article) => article.id));
  const recentDecks = [];
  const regenerated = [];

  for (const article of merged) {
    const old = {
      old_public_deck: oldPublicDeck(article),
      old_lane: oldLane(article),
      old_public_metadata_fields: publicMetadataFields(article),
    };

    let next = normalizeArticleTextFields(article);
    if (next.generation_version !== GENERATION_VERSION && next.expertLensFull?.generation_version !== GENERATION_VERSION) {
      next.public_copy_stale = true;
    }

    if (selectedIds.has(next.id)) {
      const relevance = classifyInfrastructureRelevance(next);
      next = {
        ...next,
        ...relevance,
        infrastructure_relevance: relevance,
      };
      next = applyPublicRouting(next);
      const route = next.public_routing || routePublicLane(next);
      const sourceCompleteness = analyzeSourceTextCompleteness(next);
      const storyGate = canGenerateFullArticle(next);

      if (route.visibility === 'archive') {
        next = forceArchive(next, route.blocked_reasons || ['archive_only']);
      } else if (route.visibility === 'core' && storyGate.ok && sourceCompleteness.ok) {
        const story = buildEditorialStoryV2(next, { recentHooks: recentDecks });
        if (story.ok) {
          next = articleWithStory(next, story);
        } else {
          next = forceAdjacent(next, story.blocked_reasons.length ? story.blocked_reasons : ['copy_quality_blocked']);
        }
      } else if (route.visibility === 'core') {
        const reasons = [...(storyGate.reasons || []), ...(sourceCompleteness.reasons || [])];
        const hasOnlyShortEvidence = reasons.length > 0 &&
          reasons.every((reason) => reason === 'source_evidence_length_below_280');
        next = hasOnlyShortEvidence
          ? forceCoreSourceCard(next, route, reasons)
          : forceAdjacent(next, reasons);
      }

      const finalRoute = next.public_routing || routePublicLane(next);
      const excerpt = generateEditorialExcerpt(next, { route: finalRoute, recentDecks });
      next = {
        ...next,
        generation_version: GENERATION_VERSION,
        public_generation_version: GENERATION_VERSION,
        public_copy_stale: false,
        public_presentation: buildPublicPresentation(
          {
            ...next,
            deck: excerpt.deck,
            why_it_matters: excerpt.why_it_matters,
          },
          { route: finalRoute, recentDecks }
        ),
        deck: excerpt.deck,
        why_it_matters: excerpt.why_it_matters,
        regeneration_v2_audit: old,
      };
      recentDecks.push(next.public_presentation.deck);
    }

    regenerated.push(next);
  }

  const { latest: nextLatest, archive: nextArchive } = await syncArchiveArtifacts(regenerated, []);
  await writeJsonFile(LATEST_NEWS_PATH, nextLatest);
  await writeJsonFile(ARCHIVE_NEWS_PATH, nextArchive);
  await writeReports({
    beforeRecords: merged,
    afterRecords: mergeById([...nextLatest, ...nextArchive]).slice(0, REGENERATE_LIMIT),
    processedCount: selectedIds.size,
  });

  console.log(`regenerated ${selectedIds.size} public content records with ${GENERATION_VERSION}`);
}

await main();
