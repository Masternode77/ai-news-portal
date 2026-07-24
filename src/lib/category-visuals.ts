// Maps editorial category labels to a stable visual key used for
// color-coding cards, ticker dots, and coverage-mix segments.
export type CategoryVisualKey =
  | 'power'
  | 'datacenter'
  | 'cloud'
  | 'silicon'
  | 'cooling'
  | 'capital'
  | 'policy'
  | 'ai';

export function categoryKey(label: unknown = ''): CategoryVisualKey {
  const value = String(label ?? '').toLowerCase();
  if (/(power|grid|energy|utilit|nuclear|transmission|electric)/.test(value)) return 'power';
  if (/(data center|datacenter|colocation|colo|campus|site|land)/.test(value)) return 'datacenter';
  if (/(cloud|capacity|hyperscal)/.test(value)) return 'cloud';
  if (/(semiconductor|silicon|chip|gpu|hbm|foundr|memory|systems)/.test(value)) return 'silicon';
  if (/(cool|thermal|liquid|water)/.test(value)) return 'cooling';
  if (/(capital|deal|market|financ|invest|funding|m&a)/.test(value)) return 'capital';
  if (/(policy|regulat|siting|permit|law|government)/.test(value)) return 'policy';
  return 'ai';
}

export function categoryShortLabel(label: unknown = ''): string {
  const key = categoryKey(label);
  const names: Record<CategoryVisualKey, string> = {
    power: 'Power & Grid',
    datacenter: 'Data Centers',
    cloud: 'Cloud Capacity',
    silicon: 'Silicon & Systems',
    cooling: 'Cooling',
    capital: 'Capital & Deals',
    policy: 'Policy & Siting',
    ai: 'AI Infrastructure',
  };
  return names[key];
}
