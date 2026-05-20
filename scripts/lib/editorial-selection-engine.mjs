import { explainSignalRank } from './signal-rank-explainer.mjs';

function signalText(cluster = {}) {
  return [
    cluster.cluster_title,
    cluster.cluster_topic,
    cluster.primary_infrastructure_layer,
    ...(cluster.companies || []),
    ...(cluster.extracted_facts || []),
  ].filter(Boolean).join(' ');
}

function hasExplicitInfrastructureLink(cluster = {}) {
  const text = signalText(cluster);
  const strongInfra = /\b(data centers?|colocation|campus|facility|power|grid|utility|substation|battery storage|cooling|thermal|cloud capacity|cloud region|ec2|server|hpc|epyc|xeon|gpu|accelerator|hbm|memory|semiconductor|chip|network|fiber|storage|backup|kubernetes|openshift|virtualization|platform infrastructure|reit|lease|project finance|permitting|siting|zoning|moratorium)\b/i.test(text);
  const weakConsumerOrApp = /\b(search box|gmail inbox|surface laptop|surface for business|consumer|gaming|tv|movie|sports|job cuts|labor market|biography|founder profile|teen hacker|general ai agent|ai design|productivity app|health insurer|recruiting|doctolib|byron allen)\b/i.test(text);
  if (!strongInfra) return false;
  if (!weakConsumerOrApp) return true;
  return /\b(data centers?|power|grid|cloud capacity|ec2|server|hpc|epyc|enterprise storage|powerstore|network fabric|fiber backbone|platform infrastructure|reit|lease|permitting|siting)\b/i.test(text);
}

function routeForScore(cluster = {}) {
  const score = Number(cluster.signal_score || 0);
  const factCount = cluster.extracted_facts?.length || 0;
  const hasLayer = Boolean(cluster.primary_infrastructure_layer) && hasExplicitInfrastructureLink(cluster);
  const hasAnchor = (cluster.numeric_claims?.length || 0) > 0
    || /policy|siting|permit|moratorium|regulation/i.test(cluster.primary_infrastructure_layer || cluster.cluster_topic || '')
    || /\b(storage|platform|cloud|server|hpc|semiconductor|memory|network|fiber|data center|facility|power|grid)\b/i.test(signalText(cluster));
  if (score >= 82 && factCount >= 4 && hasLayer && hasAnchor) return 'Featured Analysis';
  if (score >= 70 && factCount >= 4 && hasLayer && hasAnchor) return 'Standard Analysis';
  if (score >= 55 && hasLayer) return 'Watchlist Signal';
  return 'Internal Archive';
}

export function selectEditorialSignals(clusters = [], options = {}) {
  const max = options.maxLongform ?? 3;
  const ranked = [...clusters]
    .map((cluster) => {
      const editorial_route = routeForScore(cluster);
      return {
        ...cluster,
        editorial_route,
        rank_reasons: explainSignalRank(cluster),
      };
    })
    .sort((a, b) => (b.signal_score || 0) - (a.signal_score || 0));

  const selected_for_analysis = [];
  const held_signals = [];
  const rejected_signals = [];

  for (const cluster of ranked) {
    if (['Featured Analysis', 'Standard Analysis'].includes(cluster.editorial_route) && selected_for_analysis.length < max) {
      selected_for_analysis.push({ ...cluster, publish_decision: 'selected_for_analysis' });
    } else if (cluster.editorial_route === 'Watchlist Signal') {
      held_signals.push({ ...cluster, publish_decision: 'watchlist' });
    } else {
      rejected_signals.push({ ...cluster, publish_decision: 'rejected' });
    }
  }

  return {
    ranked_candidates: ranked,
    selected_for_analysis,
    held_signals,
    rejected_signals,
    no_qualifying_signal_reason: selected_for_analysis.length ? '' : 'No signal cluster passed score, evidence, verification, and infrastructure-layer thresholds.',
  };
}
