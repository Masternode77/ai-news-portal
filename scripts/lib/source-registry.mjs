import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE_REGISTRY_PATH = path.join(ROOT, 'config/sourceRegistry.yml');

export const REQUESTED_SOURCE_IDS = [
  'datacenterdynamics',
  'uptime-institute-journal',
  'hpcwire',
  'insidehpc',
  'blocks-and-files',
  'siliconangle-ai',
  'theregister-data-centre',
  'utility-dive',
  'power-engineering',
  'capacity-media',
];

function coerceValue(raw = '') {
  const value = String(raw).trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseSourceRegistryYaml(raw = '') {
  const sources = [];
  let current = null;

  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#') || line.trim() === 'sources:') continue;
    const itemMatch = line.match(/^\s*-\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (itemMatch) {
      if (current) sources.push(current);
      current = { [itemMatch[1]]: coerceValue(itemMatch[2]) };
      continue;
    }
    const fieldMatch = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (fieldMatch && current) {
      current[fieldMatch[1]] = coerceValue(fieldMatch[2]);
    }
  }

  if (current) sources.push(current);
  return sources.filter((source) => source.id && source.name && source.domain);
}

export async function loadSourceRegistry(filePath = SOURCE_REGISTRY_PATH) {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseSourceRegistryYaml(raw);
}

export function requestedSourceCoverage(sources = []) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return REQUESTED_SOURCE_IDS.map((id) => ({
    id,
    present: byId.has(id),
    source: byId.get(id) || null,
  }));
}

export function activeRegistryFeeds(sources = []) {
  return sources
    .filter((source) => source.feed && !['blocked', 'paywalled', 'extraction_failed'].includes(source.status))
    .map((source) => ({
      source: source.name,
      url: source.feed,
      region: source.region || 'Global',
      language: source.language || 'en',
      defaultCategory: source.defaultCategory || 'AI Infrastructure (GPU/Neocloud)',
    }));
}
