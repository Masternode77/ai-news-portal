export const PROPER_NOUN_REPLACEMENTS = [
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
  ['vm', 'VM'],
  ['vms', 'VMs'],
  ['dr', 'DR'],
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
