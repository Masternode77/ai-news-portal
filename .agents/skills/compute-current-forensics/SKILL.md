---
name: compute-current-forensics
description: Use for read-only Compute Current investigations that map source quality, article generation, public output, audits, or regressions before proposing edits.
---

# Compute Current Forensics

Use this skill to investigate without changing files.

## Sources
- Start with `AGENTS.md`, then narrower `AGENTS.md` files in the area inspected.
- For generation logic, read `scripts/lib/AGENTS.md` and `scripts/lib/AGENTS.override.md`.
- Treat source modules, policy files, and tests as truth; generated `dist/` output is evidence only.

## Workflow
1. Identify the relevant surface: public site, admin, editorial pipeline, source QA, images, or deployment.
2. Use `rg`/targeted file reads to map data flow and gates.
3. Check the nearest tests and package scripts that prove the behavior.
4. Report findings with file references, confidence, and the smallest safe next step.

## Useful Commands
- `npm run check`
- `npm run build`
- `npm run content:gate`
- `npm run audit:public`
- `npm run qa:qc`
