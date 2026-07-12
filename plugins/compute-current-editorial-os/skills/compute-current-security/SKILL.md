---
name: compute-current-security
description: Use when changing or auditing Compute Current admin routes, public rendering safety, outbound media, headers, storage, auth, or secret handling.
---

# Security

Use this skill for security-sensitive code or audits.

## Canonical Rules
- Admin routes stay private and excluded from public/static output.
- Never print secrets or token values; count environment variables only when needed.
- Unsafe source URLs and outbound media must fail closed.
- Keep auth, storage, and CMS service boundaries intact.

## Workflow
1. Identify whether the change touches `api/admin`, `src/admin`, storage adapters, headers, public rendering, or outbound media.
2. Verify the nearest admin/public security tests before broad gates.
3. Report any unverified production credential assumptions as gaps.

## Useful Commands
- `node --test tests/admin-security.test.mjs tests/public-render-security.test.mjs tests/outbound-media-security.test.mjs tests/security-headers.test.mjs`
- `npm run audit:admin`
- `npm run content:gate`
