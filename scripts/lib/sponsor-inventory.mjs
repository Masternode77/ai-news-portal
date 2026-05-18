import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INVENTORY_PATH = path.join(ROOT, 'config/sponsorInventory.yml');

function parseSponsorInventory(raw = '') {
  const slots = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const itemMatch = line.match(/^\s*-\s+id:\s*(.+?)\s*$/);
    if (itemMatch) {
      current = { id: itemMatch[1].trim() };
      slots.push(current);
      continue;
    }
    const propMatch = line.match(/^\s{4}([a-z_]+):\s*(.+?)\s*$/);
    if (current && propMatch) {
      const [, key, value] = propMatch;
      current[key] = value === 'true' ? true : value === 'false' ? false : value;
    }
  }
  return slots;
}

export function loadSponsorInventory() {
  try {
    return parseSponsorInventory(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

export function sponsorSlotById(slotId) {
  return loadSponsorInventory().find((slot) => slot.id === slotId) || null;
}

export function activeSponsorSlots() {
  return loadSponsorInventory().filter((slot) => slot.active === true && slot.sponsor_name);
}

export const SPONSOR_PRODUCTS = [
  'Homepage Sponsor',
  'Daily Brief Sponsor',
  'Weekly Deep Dive Sponsor',
  'Category Lane Sponsor',
  'Sponsored Report',
  'Webinar Sponsor',
  'Vendor Directory Featured Listing',
  'Job Board Listing',
];

export const SPONSOR_INTERESTS = [
  'Homepage Sponsor',
  'Daily Brief Sponsor',
  'Weekly Deep Dive Sponsor',
  'Category Lane Sponsor',
  'Sponsored Report',
  'Webinar Sponsor',
  'Vendor Directory Featured Listing',
  'Job Board Listing',
];
