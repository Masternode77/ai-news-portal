# Test Surface Instructions

## OVERVIEW

`tests/` is the project governance perimeter: Node test-runner suites for editorial quality, public rendering contracts, admin security, source fidelity, and pipeline behavior.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Public rendering contract | `tests/public-*.test.mjs`, `tests/homepage-*.test.mjs` | Public surface must not leak internal/admin language. |
| Editorial quality gates | `tests/*quality*`, `tests/*guard*`, `tests/*fidelity*` | Lock source QA, repetition, copyright, and relevance behavior. |
| Blog/autonomous engines | `tests/blog-*.test.mjs`, `tests/editorial-*.test.mjs` | Pair with `scripts/lib` changes. |
| Admin behavior | `tests/admin-*.test.mjs` | Auth, routes, editor, dashboard, audit log. |
| Fixtures | `tests/fixtures` | Keep fixtures specific; banned phrase literals only when asserting guards. |

## CONVENTIONS

- Tests use Node's built-in runner: `node --test tests/*.test.mjs`.
- Prefer targeted scripts from `package.json` before full `npm run test`.
- Regression tests should protect existing behavior before cleanup/refactor edits.
- Quality gates should fail closed: thin extraction or unsupported claims must not become publishable long-form output.

## ANTI-PATTERNS

- Do not delete or weaken failing tests to get green output.
- Do not copy banned phrase inventories into fixtures unless the test explicitly asserts guard behavior.
- Do not make snapshots or fixtures generic article templates.
- Do not skip source-fidelity or repetition coverage when changing article generation.
