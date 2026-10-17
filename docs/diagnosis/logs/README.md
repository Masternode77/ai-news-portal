# Diagnosis logs (evidence drop zone)

Place run logs here for `docs/diagnosis/02-funnel.md`:

- GitHub Actions "Update News" scheduled runs (before 2026-10-06) if a full
  job log is exported: `actions-<run_id>.txt`. The cloud session could only
  read the last 5,000 lines of each job through the GitHub API, which never
  reaches the `Run news update` step, and the log archive host is blocked by
  the sandbox proxy.
- Mac Codex task stdout for subscription runs (after 2026-10-06):
  `mac-<yyyy-mm-dd>-<slot>.txt`.

Useful lines, as printed by `scripts/pipeline.mjs` and `scripts/lib/fetch-feeds.mjs`:

```
[pipeline] run started at <iso>
[pipeline] feed failed: <source> ...
[pipeline] pool loaded: <n> items
[pipeline] plan selected for <day> slot=<n> picked=<n>
[pipeline] relevance gate: fullMemoCandidates=<n> signalCards=<n> archiveOnly=<n>
[pipeline] authored column: none this run (<reason>)
```

Redact anything that looks like a token, key, email address or home-directory
path before committing. Nothing in this directory is read by the site or the
pipeline.
