# Admin Authentication Production Gate

The in-process login throttle is only defense in depth. Serverless instances do not share its memory, so it is not a production rate limit. Login requests derive that local key from the socket peer only; forwarding headers are intentionally ignored because a direct caller can forge them.

The production login endpoint fails closed until `ADMIN_VERCEL_RATE_LIMIT_READY=true` is configured. This is an operator attestation, not evidence that a Vercel Firewall rule exists. Set it only after all of the following are complete for the production project:

1. In **Vercel → Project → Firewall → Configure → New Rule**, create a rule named `admin-login-rate-limit` with both conditions: request path equals `/api/admin/login` and request method equals `POST`.
2. Use the **Rate Limit** action, count by **IP**, set a fixed 15-minute window with a limit of 5 requests, and keep the blocking response as HTTP 429. Do not use a log-only action.
3. Publish the Firewall change, then use the Firewall overview for the named rule to confirm the rule is active and observe a controlled test that receives HTTP 429 after the sixth request from one IP.
4. Record the project, rule name, verification time, and operator in the deployment change record. Only then set `ADMIN_VERCEL_RATE_LIMIT_READY=true` in the production environment and redeploy.

Remove the attestation and redeploy before any firewall-rule deletion, project move, route change, or rate-limit-policy change. This immediately disables login until the external control is reverified.

The authentication variables fail closed as well: generate `ADMIN_PASSWORD_HASH` with `scripts/admin-password-hash.mjs`, and replace the session-secret template value with a cryptographically random value of at least 32 bytes. Placeholder, common, low-entropy, malformed-hash, and undersized-salt values cannot create or validate an admin session.

Vercel documents the required Firewall rate-limit workflow, including path conditions, counting keys, publishing changes, and Firewall-overview verification: [WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
