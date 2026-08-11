# Implementation Notes (Historical Snapshot)

> **Historical snapshot — non-operational.** This pre-current-runtime note is
> retained only as historical context. It is not an operator guide, deployment
> checklist, provider-default statement, or live credential instruction.

## Historical context

An earlier iteration described a different visual treatment, a ChatGPT OAuth
image-provider default, and related live-environment steps. Those details no
longer describe the candidate and must not be used to configure it.

## Current sources of truth

- `DESIGN.md` defines the current light, neutral, source-linked editorial
  system; it is not a glass or monochrome dashboard.
- `README.md` and `docs/image-generation-setup.md` describe the current
  `IMAGE_PROVIDER=image2` default and provider-specific fallback behavior.
- `scripts/lib/constants.mjs`, `scripts/lib/image2-provider.mjs`, and
  `scripts/lib/image-generator.mjs` are the executable image-provider and
  fallback contract.
- `docs/deployment-checklist.md` and
  `docs/commercialization-deploy-checklist.md` are the current operator
  preflight surfaces.

Historical notes do not establish that an external provider, credential,
workflow, deployment, or publication state is currently available.
