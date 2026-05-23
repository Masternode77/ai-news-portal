const HOOKS = [
  'constraint-first',
  'operator-calendar',
  'capital-risk',
  'supply-chain-friction',
  'policy-clock',
  'technical-reality-check',
];

export function selectHookFamily(index = 0) {
  return HOOKS[Math.abs(Number(index) || 0) % HOOKS.length];
}
