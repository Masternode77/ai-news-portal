import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG_PATH = path.join(ROOT, 'config/properNouns.yml');

function parseProperNounsConfig() {
  try {
    const lines = fs.readFileSync(CONFIG_PATH, 'utf8').split(/\r?\n/);
    const pairs = [];
    let inBlock = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === 'proper_nouns:') {
        inBlock = true;
        continue;
      }
      if (!inBlock || !trimmed || trimmed.startsWith('#')) continue;
      const match = line.match(/^\s*([^:]+):\s*["']?(.+?)["']?\s*$/);
      if (match?.[1] && match?.[2]) pairs.push([match[1].trim(), match[2].trim()]);
    }
    return pairs;
  } catch {
    return [];
  }
}

const DEFAULT_PROPER_NOUN_REPLACEMENTS = [
  ['netapp', 'NetApp'],
  ['red hat', 'Red Hat'],
  ['openshift', 'OpenShift'],
  ['proxmox', 'Proxmox'],
  ['proxmox ve', 'Proxmox VE'],
  ['kvm', 'KVM'],
  ['hyper-v', 'Hyper-V'],
  ['nutanix', 'Nutanix'],
  ['xcp-ng', 'XCP-ng'],
  ['servethehome', 'ServeTheHome'],
  ['data center frontier', 'Data Center Frontier'],
  ['datacenterfrontier', 'Data Center Frontier'],
  ['semiconductor engineering', 'Semiconductor Engineering'],
  ['nvidia', 'NVIDIA'],
  ['iren', 'IREN'],
  ['cerebras', 'Cerebras'],
  ['core scientific', 'Core Scientific'],
  ['microsoft', 'Microsoft'],
  ['anthropic', 'Anthropic'],
  ['claude', 'Claude'],
  ['google cloud', 'Google Cloud'],
  ['alloydb', 'AlloyDB'],
  ['spanner', 'Spanner'],
  ['cloud sql', 'Cloud SQL'],
  ['bigtable', 'Bigtable'],
  ['firestore', 'Firestore'],
  ['hbm', 'HBM'],
  ['h200', 'H200'],
  ['ai', 'AI'],
  ['gpu', 'GPU'],
  ['gpus', 'GPUs'],
  ['cpu', 'CPU'],
  ['cdu', 'CDU'],
  ['cdus', 'CDUs'],
  ['ppa', 'PPA'],
  ['reit', 'REIT'],
  ['vm', 'VM'],
  ['vms', 'VMs'],
  ['dr', 'DR'],
];

export const PROPER_NOUN_REPLACEMENTS = [
  ...new Map([...DEFAULT_PROPER_NOUN_REPLACEMENTS, ...parseProperNounsConfig()].map(([source, replacement]) => [source, [source, replacement]])).values(),
];

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacementPattern(source) {
  const escaped = escapeRegExp(source).replace(/\\ /g, '\\s+');
  return new RegExp(`(^|[^A-Za-z0-9])(${escaped})(?=$|[^A-Za-z0-9])`, 'gi');
}

export function normalizeProperNouns(text = '') {
  let normalized = String(text || '');
  for (const [source, replacement] of PROPER_NOUN_REPLACEMENTS) {
    normalized = normalized.replace(replacementPattern(source), (match, prefix) => `${prefix}${replacement}`);
  }
  return normalized;
}

export function malformedProperNouns(text = '') {
  const value = String(text || '');
  const matches = [];
  for (const [source, replacement] of PROPER_NOUN_REPLACEMENTS) {
    if (source === source.toUpperCase()) continue;
    const pattern = replacementPattern(source);
    for (const match of value.matchAll(pattern)) {
      const observed = match[2];
      if (observed && observed !== replacement) {
        matches.push({ observed, expected: replacement });
      }
    }
  }
  return matches;
}

export function hasMalformedProperNouns(text = '') {
  return malformedProperNouns(text).length > 0;
}
