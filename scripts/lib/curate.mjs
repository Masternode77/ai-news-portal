import {
  CANDIDATE_MAX_AGE_HOURS,
  CURATION_FLOOR,
  CURATION_FLOOR_MIN_RELEVANCE,
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
import { proceduralDocketWithoutComputeContext } from './relevance-classifier.mjs';

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
      'Prioritize source credibility, novelty, and source diversity. Skip items that only mention AI or energy in passing, such as routine enforcement actions, unrelated audits and generic grants.',
      `The desk publishes every day: select at least ${Math.min(CURATION_FLOOR, DAILY_CURATION_TARGET)} stories whenever that many candidates touch either lane, including AI company, cloud provider, chipmaker, data center operator and IT infrastructure announcements, release notes, research and policy. Return an empty selection only when no candidate touches either lane.`,
      'Among comparably consequential eligible stories, vary the mix across AI companies and model economics, data center and cloud operators (leases, earnings, financing and capacity), compute hardware, IT and networking infrastructure, power and cooling, and policy. Policy is not the default beat.',
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

function abstractOnlyCandidate(item = {}) {
  return String(item.source_text_scope || '').trim().toLowerCase() === 'abstract';
}

// The curation model may answer with fewer picks than the desk needs, or none
// at all on a quiet day. The floor tops the plan up with the strongest on-beat
// candidates (either lane at or above the minimum relevance), full-text
// sources before abstract-only ones. It never adds an item below that
// relevance, and the wire's relevance, extraction, quality and repetition
// gates still decide whether each pick becomes an article, a signal card or an
// archive record.
export function applyCurationFloor(selectedIds = [], ranked = [], {
  floor = CURATION_FLOOR,
  minRelevance = CURATION_FLOOR_MIN_RELEVANCE,
  limit = DAILY_CURATION_TARGET,
} = {}) {
  const ids = [...new Set(selectedIds)].slice(0, limit);
  const target = Math.min(Math.max(0, floor), limit);
  if (ids.length >= target) return ids;
  const chosen = new Set(ids);
  const eligible = ranked
    .filter((item) => item?.id && !chosen.has(item.id) && laneRelevance(item) >= minRelevance)
    .sort((a, b) => Number(abstractOnlyCandidate(a)) - Number(abstractOnlyCandidate(b))
      || laneRelevance(b) - laneRelevance(a)
      || publishedAtMs(b) - publishedAtMs(a));
  for (const item of eligible) {
    if (ids.length >= target) break;
    ids.push(item.id);
    chosen.add(item.id);
  }
  return ids;
}

// A fetch-time archive tier is a title-and-snippet estimate, and the curation
// model may still pick such an item (the Duane Arnold restart brief scored
// 0.28 on its feed snippet). An archive decision is definitive, and the item
// leaves the planning pool, when the classifier reached it for a reason that
// extraction cannot change (a procedural docket notice, a hard archive topic)
// or when the item was already extracted and still scores archive-only.
const DEFINITIVE_ARCHIVE_REASONS = new Set([
  'procedural_regulatory_docket_without_compute_context',
  'hard_archive_topic_outside_compute_current_boundary',
]);

export function definitivelyArchived(item = {}) {
  // A docket notice is judged directly: a cached pool item classified before
  // the guard existed carries the archive tier without the reason code.
  if (proceduralDocketWithoutComputeContext(item)) return true;
  if (item.infrastructure_relevance_tier !== 'archive_only') return false;
  const reasons = Array.isArray(item.infrastructure_relevance_reasons)
    ? item.infrastructure_relevance_reasons
    : (item.infrastructure_relevance?.infrastructure_relevance_reasons || []);
  if (reasons.some((reason) => DEFINITIVE_ARCHIVE_REASONS.has(String(reason)))) return true;
  return Boolean(item.cleaned_source_text || item.extraction_artifact);
}

export function rollingCandidates(pool, state, existingPlan, now) {
  const publishedSet = new Set([
    ...(state.publishedIds || []),
    ...(existingPlan?.publishedIds || []),
  ]);
  const cutoffMs = now.getTime() - FRESH_CANDIDATE_WINDOW_HOURS * 60 * 60 * 1000;
  const maxAgeMs = now.getTime() - CANDIDATE_MAX_AGE_HOURS * 60 * 60 * 1000;
  const ranked = rankWithDiversity(pool)
    .filter((item) => !publishedSet.has(item.id))
    .filter((item) => !definitivelyArchived(item));
  const fresh = ranked.filter((item) => publishedAtMs(item) >= cutoffMs);

  // Fresh items lead, but a handful of fresh off-beat notices must not hide
  // the week's on-beat story: older candidates inside the maximum age always
  // follow, and the shortlist then orders everything by lane relevance.
  // Nothing older than the maximum age is ever offered, even on a quiet day.
  const freshIds = new Set(fresh.map((item) => item.id));
  const recent = ranked.filter((item) => !freshIds.has(item.id) && publishedAtMs(item) >= maxAgeMs);
  return [...fresh, ...recent];
}

export async function planForToday(pool, state, now = new Date()) {
  const key = kstDayKey(now);
  const existingPlan = state.dayPlans[key];
  const ranked = rollingCandidates(pool, state, existingPlan, now);
  const llmSelection = await curateWithLlm(ranked);
  const modelIds = llmSelection === null ? fallbackCurate(ranked) : llmSelection;
  const selectedIds = applyCurationFloor(modelIds, ranked);
  if (selectedIds.length > modelIds.length) {
    console.log(`[curate] floor added ${selectedIds.length - modelIds.length} on-beat candidate(s) to ${modelIds.length} model pick(s)`);
  }
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

// Each run processes up to ITEMS_PER_RUN unprocessed curated items, and a day
// processes at most DAILY_CURATION_TARGET. Slots are recorded as run history
// only: a run that found nothing no longer locks the rest of its slot, so a
// later scheduled or manual run can still publish the day's stories.
// PIPELINE_FORCE_SLOT lifts the daily cap for an operator-forced run.
export function pickItemsForRun(plan, now = new Date(), { force = PIPELINE_FORCE_SLOT } = {}) {
  const slot = kstSlot(now);
  const publishedSet = new Set(plan.publishedIds || []);
  const remainingToday = force
    ? ITEMS_PER_RUN
    : Math.max(0, DAILY_CURATION_TARGET - publishedSet.size);
  const available = (plan.curatedItems || [])
    .filter((item) => !publishedSet.has(item.id))
    .slice(0, Math.min(ITEMS_PER_RUN, remainingToday));

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
