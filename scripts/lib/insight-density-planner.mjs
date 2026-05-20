export function planInsightDensity(evidencePack = {}) {
  const sections = [
    'context',
    'evidence',
    'interpretation',
    'stakeholder impact',
    'operating implication',
    'counterargument',
    'watch metrics',
    'bottom line',
  ];
  return {
    sections,
    target_analysis_ratio: 0.68,
    source_summary_ratio_limit: 0.35,
    must_include: ['thesis', 'counterargument', 'watch metrics', 'bottom line'],
    evidence_fact_count: evidencePack.verified_facts?.length || 0,
  };
}
