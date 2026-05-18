const TIER_ORDER = ['anonymous', 'free', 'pro', 'team', 'enterprise'];

export function normalizeEntitlement(value = 'anonymous') {
  const normalized = String(value || 'anonymous').toLowerCase();
  return TIER_ORDER.includes(normalized) ? normalized : 'anonymous';
}

export function entitlementRank(value = 'anonymous') {
  return TIER_ORDER.indexOf(normalizeEntitlement(value));
}

export function canAccessLevel(userTier = 'anonymous', accessLevel = 'free') {
  const required = normalizeEntitlement(accessLevel === 'public' ? 'free' : accessLevel);
  const current = normalizeEntitlement(userTier);
  return entitlementRank(current) >= entitlementRank(required);
}

export function gateEntitlement({ userTier = 'anonymous', accessLevel = 'free' } = {}) {
  const allowed = canAccessLevel(userTier, accessLevel);
  return {
    allowed,
    userTier: normalizeEntitlement(userTier),
    accessLevel: normalizeEntitlement(accessLevel === 'public' ? 'free' : accessLevel),
    reason: allowed ? '' : `requires_${normalizeEntitlement(accessLevel)}`,
  };
}
