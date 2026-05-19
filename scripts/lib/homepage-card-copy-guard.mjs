import { guardPublicCopy } from './copy-quality-guard.mjs';
import { guardPublicTemplatePhrases } from './public-template-phrase-guard.mjs';
import { detectBoilerplate } from './boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

const FORBIDDEN_CARD_STARTS = [
  /^the issue\b/i,
  /^the development\b/i,
  /^the real test\b/i,
  /^[A-Z][A-Za-z0-9& .'-]{2,80}\s+reported\b/i,
  /^[A-Z][A-Za-z0-9& .'-]{2,80}\s+raises\b/i,
  /^[A-Z][A-Za-z0-9& .'-]{2,80}\s+turns\b/i,
];

const CONCRETE_NOUN_PATTERN = /\b(?:[A-Z][A-Za-z0-9&'.-]{2,}|NVIDIA|AMD|GPU|CPU|HBM|CDU|PPA|REIT|OpenShift|KVM|Hyper-V|XCP-ng|\d+(?:\.\d+)?\s?(?:MW|GW|kW|GB|TB|PB|bn|million|billion|%|acres?)|Texas|China|Virginia|Ohio|NetApp|KKR|Kokusai|Data Center|cloud|grid|power|cooling|memory|storage|networking|semiconductor)\b/;

export function guardHomepageCardCopy(text = '') {
  const publicGuard = guardPublicCopy(text);
  const templateGuard = guardPublicTemplatePhrases(publicGuard.text || text);
  const boilerplate = detectBoilerplate(publicGuard.text || text);
  const truncation = detectTruncationArtifacts(publicGuard.text || text);
  const reasons = [
    ...publicGuard.reasons,
    ...templateGuard.reasons,
  ];
  if (boilerplate.boilerplate_ratio > 0 || boilerplate.copyright_footer_detected || boilerplate.nav_or_cta_detected) {
    reasons.push('boilerplate_leakage');
  }
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  if (FORBIDDEN_CARD_STARTS.some((pattern) => pattern.test(publicGuard.text || text))) {
    reasons.push('forbidden_deck_start');
  }
  if (!CONCRETE_NOUN_PATTERN.test(publicGuard.text || text)) {
    reasons.push('missing_concrete_public_noun');
  }
  return {
    ok: reasons.length === 0,
    text: publicGuard.text,
    reasons: [...new Set(reasons)],
    publicGuard,
    templateGuard,
    boilerplate,
    truncation,
  };
}

export function deckPrefix(text = '', count = 8) {
  return String(text || '')
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, count)
    .join(' ');
}
