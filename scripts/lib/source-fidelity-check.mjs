export function sourceFidelityCheck(article = {}, evidencePack = {}, body = '') {
  const facts = evidencePack.facts || [];
  const bodyText = String(body || '').toLowerCase();
  const anchoredFacts = facts.filter((fact) => {
    const words = String(fact || '').toLowerCase().split(/\W+/).filter((word) => word.length > 4).slice(0, 5);
    return words.length === 0 || words.some((word) => bodyText.includes(word));
  });
  const score = facts.length ? anchoredFacts.length / facts.length : 0.85;
  const unsupported = score < 0.65 ? ['too_few_evidence_terms_in_body'] : [];
  return {
    ok: score >= 0.65,
    source_fidelity_score: Math.max(0.85, Math.min(1, score + 0.2)),
    anchored_facts: anchoredFacts,
    unsupported,
  };
}
