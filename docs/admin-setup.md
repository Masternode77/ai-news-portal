# Admin Setup

The admin surface is private, noindexed, and backed by the API routes under `api/admin/`. It is disabled until all three auth variables are present:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`

## Generate A Password Hash

Use a temporary password and store only the generated scrypt hash:

```bash
node scripts/admin-password-hash.mjs --password "temporary-password" --dry-run
```

Copy the `ADMIN_PASSWORD_HASH=scrypt$...` value into the deployment environment. Do not add a plaintext `ADMIN_PASSWORD` variable; the runtime intentionally reads `ADMIN_PASSWORD_HASH`.

## Secret Rotation

For secret rotation, generate a new password hash, replace `ADMIN_PASSWORD_HASH`, and rotate `ADMIN_SESSION_SECRET` at the same time. Rotating `ADMIN_SESSION_SECRET` invalidates existing cookies because the `cc_admin` session signature changes.

Use a 64+ character random value for `ADMIN_SESSION_SECRET`. In production, also verify the cookie includes `HttpOnly`, `SameSite=Strict`, and `Secure`.

## GitHub Save Access

Publishing and editor saves use:

- `GITHUB_TOKEN`, `GH_TOKEN`, or `COMPUTE_CURRENT_GITHUB_TOKEN`
- `GITHUB_REPO`
- `GITHUB_BRANCH`

The token needs repository contents write access. Preview actions do not create commits; save and publish actions update the source JSON, search index, and admin audit log.

## Reset Procedure

1. Rotate `ADMIN_SESSION_SECRET`.
2. Generate a new `ADMIN_PASSWORD_HASH`.
3. Redeploy with both values together.
4. Run `npm run content:gate`.
5. Log in at `/admin.html` and verify the dashboard loads after authentication.
