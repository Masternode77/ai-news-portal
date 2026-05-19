import { gateEntitlement } from './entitlement-gate.mjs';

export const SOFT_PAYWALL_LIMITS = {
  anonymousFreeArticles: 3,
  previewParagraphs: 4,
};

export function articleAccessLevel(article = {}) {
  const explicit = String(article.access_level || article.accessLevel || '').toLowerCase();
  if (['free', 'pro', 'team', 'enterprise'].includes(explicit)) return explicit;
  if (article.premium === true || article.isPremium === true) return 'pro';
  return 'free';
}

export function evaluatePaywallPolicy(article = {}, context = {}) {
  const accessLevel = articleAccessLevel(article);
  const userTier = context.userTier || 'anonymous';
  const gate = gateEntitlement({ userTier, accessLevel });
  const previewOnly = !gate.allowed && accessLevel !== 'free';

  return {
    ...gate,
    accessLevel,
    previewOnly,
    previewParagraphs: SOFT_PAYWALL_LIMITS.previewParagraphs,
    ctaLabel: accessLevel === 'enterprise' ? 'Request Enterprise Access' : 'Upgrade to Pro',
    ctaHref: accessLevel === 'enterprise' ? '/enterprise/' : '/pricing/',
  };
}
