function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function selectEditorialAngle(article = {}, evidencePack = {}, route = {}) {
  const layer = evidencePack.affectedInfrastructureLayer || article.infrastructure_layer || 'AI infrastructure';
  const actor = evidencePack.namedActors?.[0] || article.source || 'the market';
  const title = compact(article.title);
  const routeLabel = route.label || article.publishing_route || 'Standard Blog';
  return {
    thesis: `${title} is worth a local Compute Current read because ${actor} is touching the ${layer} layer, not merely adding another generic AI headline.`,
    lens: route.strict?.editorial_lens || article.editorial_lens || article.public_presentation?.editorial_lens || 'Infrastructure Execution',
    routeLabel,
  };
}
