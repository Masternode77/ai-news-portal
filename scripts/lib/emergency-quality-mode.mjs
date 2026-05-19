export const EMERGENCY_QUALITY_MODE_ENV = 'COMPUTE_CURRENT_DISABLE_EMERGENCY_QUALITY_MODE';

export function isEmergencyQualityModeEnabled(env = process.env) {
  return String(env[EMERGENCY_QUALITY_MODE_ENV] || '').toLowerCase() !== 'true';
}

export function emergencyQualityModeState(env = process.env) {
  const enabled = isEmergencyQualityModeEnabled(env);
  return {
    enabled,
    disabled_by_env: !enabled,
    disable_env_var: EMERGENCY_QUALITY_MODE_ENV,
  };
}
