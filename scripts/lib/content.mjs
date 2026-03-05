import { truncate } from './normalize.mjs';

function summarize(item) {
  const base = item.snippet || item.title;
  const summary = truncate(base, 145);

  if (summary.endsWith('.')) return summary;
  return `${summary}.`;
}

function inferTheme(text) {
  const lower = text.toLowerCase();
  if (/(gpu|nvidia|amd|inference|training)/.test(lower)) return 'accelerated compute economics';
  if (/(fab|wafer|process|semiconductor|chip)/.test(lower)) return 'semiconductor supply constraints';
  if (/(cooling|rack|power|grid|campus|facility|data center|datacenter)/.test(lower)) return 'infrastructure and power-density tradeoffs';
  if (/(cloud|kubernetes|region|availability|outage|edge)/.test(lower)) return 'cloud platform resilience and distribution';
  return 'AI infrastructure execution risk';
}

export function buildInsight(item) {
  const theme = inferTheme(`${item.title} ${item.snippet}`);
  return truncate(
    `Expert insight: This development signals a near-term shift in ${theme}; operators that plan capacity, power, and procurement together will gain the margin and latency advantage.`,
    190,
  );
}

export function enrichContent(item) {
  return {
    ...item,
    summary: summarize(item),
    insight: buildInsight(item),
  };
}
