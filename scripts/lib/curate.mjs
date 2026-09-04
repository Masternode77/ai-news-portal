import {
  CURATION_MODEL,
  DAILY_CURATION_TARGET,
  FRESH_CANDIDATE_WINDOW_HOURS,
  ITEMS_PER_RUN,
  OPENROUTER_MODEL,
  PIPELINE_FORCE_SLOT,
} from './constants.mjs';
import { kstDayKey, kstSlot } from './normalize.mjs';
import { callOpenRouterJson, isModelNotAvailableError } from './openrouter.mjs';
import { rankWithDiversity } from './rank.mjs';

const CURATION_SHORTLIST_LIMIT = Number(process.env.CURATION_SHORTLIST_LIMIT || 30);

function laneRelevance(item = {}) {
  return Math.max(Number(item.infrastructure_relevance_score) || 0, Number(item.ai_topic_score) || 0);
}

// The model sees the whole pool, strongest lane first, rather than the dozen
// most recent items: on a thin day the one on-beat story is often older than
// the audits and press statements that arrived after it.
export function curationShortlist(items = []) {
  return [...items]
    .sort((a, b) => laneRelevance(b) - laneRelevance(a) || (b.score || 0) - (a.score || 0))
    .slice(0, Math.max(DAILY_CURATION_TARGET + 4, CURATION_SHORTLIST_LIMIT));
}

// null means the model could not answer (failure, non-JSON); an empty array
// means it answered that nothing qualifies. Only the first falls back to the
// deterministic ranker; the second is a decision and stands.
export function resolveCuratedSelection(result, shortlist = []) {
  if (!result || !Array.isArray(result.selectedIds)) return null;
  const ids = result.selectedIds.filter((id) => shortlist.some((item) => item.id === id));
  if (!ids.length && result.selectedIds.length) return null;
  return ids.slice(0, DAILY_CURATION_TARGET);
}

async function curateWithLlm(items) {
  const shortlist = curationShortlist(items);
  const payload = shortlist.map((item) => ({
    id: item.id,
    source: item.source,
    title: item.title,
    snippet: item.snippet,
    publishedAt: item.publishedAt,
    categoryHint: item.primary_category || item.defaultCategory || item.categoryHint || null,
    region: item.region || null,
    score: item.score,
    aiTopicScore: item.ai_topic_score ?? null,
  }));

  const request = {
    systemPrompt: [
      'You are the curation editor for an AI and data center signal board.',
      'Select the most decision-useful stories for operators, investors, site selectors, and infrastructure strategists.',
      'Two lanes qualify. Infrastructure: data center load, grid capacity, generation and interconnection, chips and accelerators, cooling, cloud capacity, colocation, or capital flowing into those. AI: frontier model releases and capabilities, AI lab strategy and financing, AI policy and regulation, AI security incidents, and compute demand from AI workloads.',
      'Prioritize source credibility, novelty, and source diversity. Skip enforcement actions, audits, grants, and announcements that only mention AI or energy in passing, even if that leaves fewer picks. An empty selection is a valid answer when nothing qualifies.',
      `Return JSON only with key selectedIds as an array of up to ${DAILY_CURATION_TARGET} ids, best first.`,
    ].join(' '),
    userPrompt: JSON.stringify({ candidates: payload }),
    // Reasoning models spend completion tokens before the answer; a 500-token
    // budget can leave the JSON body empty.
    maxTokens: 1200,
    responseFormat: { type: 'json_object' },
  };
  let usedModel = CURATION_MODEL;
  const result = await callOpenRouterJson({ ...request, model: CURATION_MODEL }).catch(async (error) => {
    console.warn(`[curate] model ${CURATION_MODEL} failed: ${error.message}`);
    if (CURATION_MODEL !== OPENROUTER_MODEL && isModelNotAvailableError(error)) {
      console.warn(`[curate] retrying curation with fallback model ${OPENROUTER_MODEL}`);
      usedModel = OPENROUTER_MODEL;
      return callOpenRouterJson({ ...request, model: OPENROUTER_MODEL }).catch(() => null);
    }
    return null;
  });

  const selected = resolveCuratedSelection(result, shortlist);
  if (selected === null) {
    const detail = result && Array.isArray(result.selectedIds)
      ? `${result.selectedIds.length} ids, none from the shortlist`
      : 'no usable selection';
    console.warn(`[curate] ${usedModel} returned ${detail}; deterministic ranker takes over`);
    return null;
  }
  if (!selected.length) {
    console.log(`[curate] ${usedModel} selected none of ${shortlist.length} candidates; nothing qualifies this run`);
    return [];
  }
  console.log(`[curate] ${usedModel} selected ${selected.length} of ${shortlist.length} candidates`);
  return selected;
}

function fallbackCurate(ranked) {
  const selected = [];
  const sourceSeen = new Set();
  const categorySeen = new Set();

  for (const item of ranked) {
    if (selected.length >= DAILY_CURATION_TARGET) break;
    const sourceOkay = !sourceSeen.has(item.source) || sourceSeen.size >= 4;
    const taxonomyCategory = item.primary_category || item.defaultCategory || item.categoryHint;
    const categoryOkay = !categorySeen.has(taxonomyCategory) || categorySeen.size >= 4;
    if (sourceOkay || categoryOkay) {
      selected.push(item.id);
      sourceSeen.add(item.source);
      categorySeen.add(taxonomyCategory);
    }
  }

  if (selected.length < DAILY_CURATION_TARGET) {
    for (const item of ranked) {
      if (selected.includes(item.id)) continue;
      selected.push(item.id);
      if (selected.length >= DAILY_CURATION_TARGET) break;
    }
  }

  return selected.slice(0, DAILY_CURATION_TARGET);
}

function publishedAtMs(item) {
  const timestamp = new Date(item.publishedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function rollingCandidates(pool, state, existingPlan, now) {
  const publishedSet = new Set([
    ...(state.publishedIds || []),
    ...(existingPlan?.publishedIds || []),
  ]);
  const cutoffMs = now.getTime() - FRESH_CANDIDATE_WINDOW_HOURS * 60 * 60 * 1000;
  const ranked = rankWithDiversity(pool).filter((item) => !publishedSet.has(item.id));
  const fresh = ranked.filter((item) => publishedAtMs(item) >= cutoffMs);

  if (fresh.length >= ITEMS_PER_RUN) {
    return fresh;
  }

  const freshIds = new Set(fresh.map((item) => item.id));
  return [
    ...fresh,
    ...ranked.filter((item) => !freshIds.has(item.id)),
  ];
}

export async function planForToday(pool, state, now = new Date()) {
  const key = kstDayKey(now);
  const existingPlan = state.dayPlans[key];
  const ranked = rollingCandidates(pool, state, existingPlan, now);
  const llmSelection = await curateWithLlm(ranked);
  const selectedIds = llmSelection === null ? fallbackCurate(ranked) : llmSelection;
  const curatedItems = selectedIds
    .map((id) => ranked.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, DAILY_CURATION_TARGET);

  const plan = {
    date: key,
    createdAt: existingPlan?.createdAt || now.toISOString(),
    refreshedAt: now.toISOString(),
    candidateWindowHours: FRESH_CANDIDATE_WINDOW_HOURS,
    curatedItems,
    curatedIds: curatedItems.map((item) => item.id),
    publishedIds: existingPlan?.publishedIds || [],
    slotPublications: existingPlan?.slotPublications || {},
  };

  return { key, plan };
}

export function pickItemsForRun(plan, now = new Date()) {
  const slot = kstSlot(now);
  const alreadySlotPublished = plan.slotPublications?.[slot];
  if (alreadySlotPublished && !PIPELINE_FORCE_SLOT) return { slot, picked: [] };

  const publishedSet = new Set(plan.publishedIds || []);
  const available = (plan.curatedItems || [])
    .filter((item) => !publishedSet.has(item.id))
    .slice(0, ITEMS_PER_RUN);

  return { slot, picked: available };
}

export function updatePlanAfterRun(plan, picked, slot) {
  const pickedIds = picked.map((item) => item.id);
  return {
    ...plan,
    publishedIds: [...new Set([...(plan.publishedIds || []), ...pickedIds])],
    slotPublications: {
      ...(plan.slotPublications || {}),
      [slot]: true,
    },
  };
}
