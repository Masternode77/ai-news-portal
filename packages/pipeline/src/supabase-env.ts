/**
 * Which Supabase project a writing command reaches, by environment variable
 * NAME (values stay in the environment and are never logged). Phase 4 wrote
 * the staging project only; the Phase 5 cutover flag adds the production pair,
 * which a real run uses only with CC_ALLOW_PRODUCTION_PUBLISH=true
 * (docs/migration/phase5-cutover.md steps 7 and 10).
 */
import type { PublishTarget } from "@cc/shared";

export interface SupabaseEnvNames {
  url: string;
  key: string;
}

export const STAGING_SUPABASE_ENV: SupabaseEnvNames = { url: "SUPABASE_URL", key: "SUPABASE_SERVICE_ROLE_KEY" };
export const PRODUCTION_SUPABASE_ENV: SupabaseEnvNames = { url: "SUPABASE_PROD_URL", key: "SUPABASE_PROD_SERVICE_ROLE_KEY" };
/** The second key of the cutover flag. */
export const PRODUCTION_ALLOW_ENV = "CC_ALLOW_PRODUCTION_PUBLISH";

export function supabaseEnvFor(target: PublishTarget): SupabaseEnvNames {
  return target === "production" ? PRODUCTION_SUPABASE_ENV : STAGING_SUPABASE_ENV;
}

export function productionAllowed(env: NodeJS.ProcessEnv): boolean {
  return env[PRODUCTION_ALLOW_ENV] === "true";
}
