function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function selectEditorialAngle(article = {}, evidencePack = {}, route = {}) {
  const layer = evidencePack.affectedInfrastructureLayer || article.infrastructure_layer || 'AI infrastructure';
  const actor = evidencePack.namedActors?.[0] || article.source || 'the market';
  const title = compact(article.title);
  const routeLabel = route.label || article.publishing_route || 'Standard Blog';
  return {
    thesis: `${title} matters because ${actor} is changing the control point around ${layer}, where timing, cost, and delivery risk decide whether demand becomes usable capacity.`,
    lens: route.strict?.editorial_lens || article.editorial_lens || article.public_presentation?.editorial_lens || 'Infrastructure Execution',
    routeLabel,
  };
}
