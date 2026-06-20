# Public Cache Purge Report

Generated at: 2026-06-09T17:53:38.461Z
Status: skipped
Reason: missing COMPUTE_CURRENT_CACHE_PURGE_URL.

Static/app/CDN purge hook is wired, but this local run did not have deployment cache credentials.
VERCEL_DEPLOY_HOOK_URL is a deploy trigger, not a cache-purge endpoint, and is intentionally ignored here.
