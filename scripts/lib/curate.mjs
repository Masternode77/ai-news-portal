import { DAILY_CURATION_TARGET, ITEMS_PER_RUN } from './constants.mjs';
import { rankWithDiversity } from './rank.mjs';

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function runSlot(date = new Date()) {
  const hour = date.getUTCHours();
  return Math.floor(hour / 8); // 0,1,2
}

export function planForToday(pool, state, now = new Date()) {
  const key = dayKey(now);
  const existingPlan = state.dayPlans[key];

  if (existingPlan?.curatedIds?.length >= DAILY_CURATION_TARGET) {
    return { key, plan: existingPlan };
  }

  const publishedSet = new Set(state.publishedIds || []);
  const ranked = rankWithDiversity(pool).filter((item) => !publishedSet.has(item.id));

  const curatedIds = ranked.slice(0, DAILY_CURATION_TARGET).map((item) => item.id);
  const plan = {
    date: key,
    curatedIds,
    publishedIds: existingPlan?.publishedIds || [],
    slotPublications: existingPlan?.slotPublications || {},
  };

  return { key, plan };
}

export function pickItemsForRun(plan, itemById, now = new Date()) {
  const slot = runSlot(now);
  const alreadySlotPublished = plan.slotPublications?.[slot];
  if (alreadySlotPublished) return { slot, picked: [] };

  const publishedSet = new Set(plan.publishedIds || []);

  const available = (plan.curatedIds || [])
    .filter((id) => !publishedSet.has(id))
    .map((id) => itemById.get(id))
    .filter(Boolean)
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
