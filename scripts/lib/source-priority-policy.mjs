import { domainFor } from './autonomous-desk-utils.mjs';

const TIER_1 = [/sec\.gov$/, /investor\./, /nvidia\.com$/, /cloud\.google\.com$/, /aws\.amazon\.com$/, /azure\.microsoft\.com$/, /bloomberg\.com$/];
const TIER_2 = [/datacenterdynamics\.com$/, /datacenterfrontier\.com$/, /datacenterknowledge\.com$/, /uptimeinstitute\.com$/, /hpcwire\.com$/, /insidehpc\.com$/, /semiengineering\.com$/, /servethehome\.com$/, /utilitydive\.com$/, /power-eng\.com$/, /capacitymedia\.com$/, /blocksandfiles\.com$/];
const TIER_3 = [/siliconangle\.com$/, /theregister\.com$/, /techcrunch\.com$/, /venturebeat\.com$/];

export function sourceCredibilityTier(item = {}) {
  const domain = item.domain || domainFor(item.sourceUrl || item.url || item.feed || '');
  if (TIER_1.some((pattern) => pattern.test(domain))) return 1;
  if (TIER_2.some((pattern) => pattern.test(domain))) return 2;
  if (TIER_3.some((pattern) => pattern.test(domain))) return 3;
  return 4;
}

export function sourcePriorityWeight(item = {}) {
  const tier = sourceCredibilityTier(item);
  if (tier === 1) return 1;
  if (tier === 2) return 0.86;
  if (tier === 3) return 0.62;
  return 0.35;
}
