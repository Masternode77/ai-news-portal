import { triangulateEvidence } from './evidence-triangulation.mjs';

function tokens(article = {}) {
  return new Set(String(article.title || '').toLowerCase().split(/\W+/).filter((word) => word.length > 4));
}

export function findCorroboratingSources(primary = {}, candidates = []) {
  const primaryTokens = tokens(primary);
  return candidates
    .filter((candidate) => candidate.id !== primary.id)
    .map((candidate) => {
      const overlap = [...tokens(candidate)].filter((token) => primaryTokens.has(token)).length;
      return { candidate, overlap };
    })
    .filter(({ overlap }) => overlap >= 2)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

export function corroborateEvidence(primary = {}, candidates = []) {
  return triangulateEvidence(primary, findCorroboratingSources(primary, candidates));
}
