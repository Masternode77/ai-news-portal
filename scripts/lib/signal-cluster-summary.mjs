import { compact, extractRegions, inferInfrastructureLayer } from './autonomous-desk-utils.mjs';

export function summarizeSignalCluster(items = []) {
  const representative = items[0] || {};
  const text = items.map((item) => [item.title, item.cleaned_text].join(' ')).join(' ');
  const companies = [...new Set(items.flatMap((item) => item.companies || []))].slice(0, 8);
  const regions = [...new Set(items.flatMap((item) => item.original?.region || item.region || extractRegions(item.title)))].filter(Boolean).slice(0, 5);
  const layer = representative.infrastructure_layer || inferInfrastructureLayer(text);
  const topic = compact(layer || representative.original?.primary_category || representative.original?.category || 'AI infrastructure signal');
  const actor = companies[0] || representative.source_name || 'AI infrastructure market';
  return {
    cluster_title: compact(`${actor}: ${representative.title || topic}`),
    cluster_topic: topic,
    primary_infrastructure_layer: layer,
    companies,
    regions: regions.length ? regions : ['Global'],
  };
}
