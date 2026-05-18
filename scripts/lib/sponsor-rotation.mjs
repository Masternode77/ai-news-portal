import { activeSponsorSlots } from './sponsor-inventory.mjs';

export function selectSponsorForSlot(slotId, context = {}) {
  const candidates = activeSponsorSlots().filter((slot) => slot.id === slotId);
  if (!candidates.length) return null;
  const seed = String(context.seed || new Date().toISOString().slice(0, 10));
  const index = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % candidates.length;
  return candidates[index];
}

export function sponsorPlacementRenderable(slotId, context = {}) {
  const sponsor = selectSponsorForSlot(slotId, context);
  return Boolean(sponsor?.sponsor_name && sponsor?.copy);
}
