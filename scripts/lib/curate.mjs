import { DAILY_CURATION_TARGET, ITEMS_PER_RUN } from './constants.mjs';
import { kstDayKey, kstSlot } from './normalize.mjs';
import { callOpenRouterJson } from './openrouter.mjs';
import { rankWithDiversity } from './rank.mjs';

async function curateWithLlm(items) {
  const shortlist = items.slice(0, Math.max(12, DAILY_CURATION_TARGET + 4));
  const payload = shortlist.map((item) => ({
    id: item.id,
    source: item.source,
    title: item.title,
    snippet: item.snippet,
    publishedAt: item.publishedAt,
    categoryHint: item.defaultCategory || item.categoryHint || null,
    region: item.region || null,
    score: item.score,
  }));

  const result = await callOpenRouterJson({
    systemPrompt: [
      'You are the curation editor for an AI and data center signal board.',
      'Select the most decision-useful stories for operators, investors, site selectors, and infrastructure strategists.',
      'Prioritize: direct relevance to AI infrastructure / cloud / power / cooling / semiconductor / colocation / APAC policy, source credibility, novelty, and source diversity.',
      `Return JSON only with key selectedIds as an array of exactly ${DAILY_CURATION_TARGET} ids when possible.`,
    ].join(' '),
    userPrompt: JSON.stringify({ candidates: payload }),
    maxTokens: 500,
  }).catch(() => null);

  if (!result || !Array.isArray(result.selectedIds)) return null;
  const selected = result.selectedIds.filter((id) => shortlist.some((item) => item.id === id));
  return selected.length ? selected.slice(0, DAILY_CURATION_TARGET) : null;
}

function fallbackCurate(ranked) {
  const selected = [];
  const sourceSeen = new Set();
  const categorySeen = new Set();

  for (const item of ranked) {
    if (selected.length >= DAILY_CURATION_TARGET) break;
    const sourceOkay = !sourceSeen.has(item.source) || sourceSeen.size >= 4;
    const categoryOkay = !categorySeen.has(item.defaultCategory || item.categoryHint) || categorySeen.size >= 4;
    if (sourceOkay || categoryOkay) {
      selected.push(item.id);
      sourceSeen.add(item.source);
      categorySeen.add(item.defaultCategory || item.categoryHint);
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

export async function planForToday(pool, state, now = new Date()) {
  const key = kstDayKey(now);
  const existingPlan = state.dayPlans[key];

  if (existingPlan?.curatedItems?.length >= DAILY_CURATION_TARGET) {
    return { key, plan: existingPlan };
  }

  const publishedSet = new Set(state.publishedIds || []);
  const ranked = rankWithDiversity(pool).filter((item) => !publishedSet.has(item.id));
  const selectedIds = (await curateWithLlm(ranked)) || fallbackCurate(ranked);
  const curatedItems = selectedIds
    .map((id) => ranked.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, DAILY_CURATION_TARGET);

  const plan = {
    date: key,
    createdAt: now.toISOString(),
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
  if (alreadySlotPublished) return { slot, picked: [] };

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
