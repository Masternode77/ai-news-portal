# Local Codex artwork automation

Baseline: live READY production and local HEAD 6bfc78fee9d81b4b527c659e2ed7872e0f78302f, v0.0.23.

Implement a read-only bounded artwork queue using existing public eligibility and image prompts. Add a reusable Codex skill to generate queued artwork with the native image tool, inspect it, and register outputs automatically. Protect registration against article revisions between queue and import using the canonical fingerprint. Preserve approved images and truthful provider/model metadata; use no API keys or exported session credentials. CI continues consuming registered files.

Validation: queue eligibility, duplicates/integrity and bounds tests; importer revision rejection before writes; existing provider tests; one native generated image through registration and output verification when an eligible pending article exists. Run Astro check/build for integration. No scheduled wakeup or production mutation is added by this change.

## Integration evidence

- Native Codex image tool returned `exec-ffea3fa1-ef63-48cf-b1ac-c8c078012d49.png`; visual review passed relevance, no visible lettering/logos, and crop suitability.
- Registered `eia-data-center-load-timing` with queued fingerprint `0e811e81371acaf900d023d47ea74b943e3d905357dda6bbb7df86b40e208fa2`. Model omitted because the tool did not report one.
- Output metadata verified: provider `codex`, status `generated`; hero 1536×864, thumbnail 1200×900, OpenGraph 1200×630. Search/taxonomy image metadata synchronized by existing build preparation.
- Astro check: 0 errors, 0 warnings, 24 hints. Build: 91 pages, success.
- Provider, import, public output and image output tests: 16 passed.
- Skill frontmatter/reference checked locally. Bundled Python validator could not run because PyYAML is unavailable; no dependency was installed for this optional check.
- Queue rerun selects `eia-server-cooling-forecast` and skips the registered sample.
- Final combined queue/import/provider/public/image tests: 22 passed. Explicit queue lookup for the generated article returns an empty successful result. Strict argument, stale registration and symlink containment coverage included.
- Production alias rechecked after implementation: still READY at the same baseline commit. Work remains local on `codex/local-image-automation-20260908`.

## Review corrections

The importer now reads the latest article collection after image generation, rechecks the captured fingerprint, preserves unrelated edits and newly added articles, and detects file changes before rename. Its lock does not coordinate arbitrary unrelated writers; the final compare/rename window is documented.

The queue now returns `register_existing` for valid source registrations whose article metadata or variants were not applied. Recovery retains known model metadata and does not generate another image. Applied registration checks include canonical paths, file presence, provider/status, generation timestamp and model.

Final combined regression run after corrections: 24 tests passed. Registered sample lookup remains an empty successful queue. No API key, credential export, recurring schedule or deployment was added.
- Recovery also preserves the original generation timestamp and explicitly excludes subsequently approved/manual/source artwork before stale/recoverable selection. Final regression suite: 25 passed.
