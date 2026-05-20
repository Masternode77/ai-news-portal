import { buildEvidencePack } from './evidence-pack-builder.mjs';

export function triangulateEvidence(primary = {}, secondaryItems = []) {
  const primaryPack = buildEvidencePack(primary);
  const secondaryPacks = secondaryItems.map((item) => buildEvidencePack(item)).filter((pack) => pack.facts.length);
  const facts = [...primaryPack.facts];
  for (const pack of secondaryPacks) {
    for (const fact of pack.facts) {
      if (facts.length >= 8) break;
      if (!facts.some((existing) => existing.toLowerCase() === fact.toLowerCase())) facts.push(fact);
    }
  }
  return {
    ...primaryPack,
    facts,
    corroboratingSources: secondaryPacks.map((pack) => pack.source),
    ok: primaryPack.ok || facts.length >= 3,
  };
}
