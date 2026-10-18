# GitHub evidence summary (read via the GitHub API on 2026-10-17)

Summaries only. Bodies were read through the GitHub MCP tools from the Phase 0
cloud session; nothing here is copied verbatim beyond short quoted phrases.

## Workflows (Masternode77/ai-news-portal)

| workflow | file | trigger | runs seen | note |
|---|---|---|---|---|
| Application Validation (was "Update News") | `update-news.yml` | push/PR to main, manual | 3,356 total; 2,500 `schedule` runs ending 2026-10-06 | Scheduled generation retired 2026-10-06 (`1fcd7023`). The MCP job-log endpoint returns only the last 5,000 lines (test output), so the `Run news update` step output is unreachable from the cloud session; the full-log archive host is blocked by the sandbox proxy. |
| Release | `release.yml` | after validation on main | 65 | Release chain used for the fix-PR timeline below. |
| Refresh infrastructure data | `infrastructure-data.yml` | cron `43 */6 * * *` | 149; 9 failures in the latest 40 (EIA timeouts) | Separate lane (grid snapshots), not the content pipeline. Open PRs #52 and #53 propose retries. |
| Operations Monitor | `operations-monitor.yml` | hourly | 216, all success | Maintains issue #29 from `src/data/pipeline-heartbeat.json` (stale after 12 h, `scripts/lib/operations-monitor.mjs:31,85`). |
| Prepare weekly digest, Visual QA, Prod Smoke, Feed Probe, Terms Probe, Curation Model Configuration | — | cron / manual | — | Not part of the generation path. |

## Issue #29 — "[Operations] Content pipeline needs attention" (open)

Auto-maintained by the monitor. State `stale_no_recent_success` since
2026-10-11T18:51Z. Last successful generation recorded: 2026-10-11T04:31:41Z.
Still open on 2026-10-17 (6 days).

## Pull requests that explain zero-output runs

| PR | merged | what the body records |
|---|---|---|
| #37 `5f80debd` | 2026-10-05 | "Restores daily publishing after the September collapse": per-run cap 3 / 9 per day replaces the slot lock, relevance-gated curation floor, column relevance 0.6 with compute anchor, 24 → 28 text-licensed feeds, 42 link-only publishers moved to a headline lane, LLM budget 120k tokens / 60 calls. |
| #38 `26dd1059` | 2026-10-05 | First live run after #37 fetched no Epoch AI items: newest pieces older than the 10-day pool window. Adds `pool_max_age_days` per source (Epoch 21 d). |
| #39 `ae80d0b5` | 2026-10-05 | Second live run processed three Epoch insights but the column stage never saw them (archive records not column candidates). |
| #40 `9976129c` | 2026-10-05 | Third live run: complete column withheld at insight density 0.769 vs floor 0.78 → floor lowered to 0.75. |
| #41 `0ee22e0c` | 2026-10-05 | Live run published nothing: daily cap counted processed items (nine archive-only picks exhausted it); one unparseable draft reply lost the only qualifying story. Cap now counts published items; one JSON repair attempt added. |
| #42 `38e0e41e` | 2026-10-05 | Column withheld at insight density 0.732 vs 0.75: the score counted 17 decision words only in singular form. Inflections now count. |
| #43 `66e4d3f9` | 2026-10-05 | First column under the new rules carried the source headline glued into its figure labels and three assertions not in the cited text. |
| #44 `74a31197` | 2026-10-11 | Isolated subscription jobs, operation lock, editorial discovery. |
| #45 `3738e4c6` | 2026-10-10 | Ground subscription analysis in validated source evidence. |
| #46 `2d647aef` | 2026-10-11 | Subscription column metadata, figures, growing catalogs. |
| #47/#48 `93341dd5` | 2026-10-11 | Corrected published articles from stored sources, added correction notes. **Introduced the EIA restoration break** (figures added to bodies that had `claim_ledger: []`). |
| #49 `198c2b5c` | 2026-10-13 | Repetition and column gates catch reused opening frames. |
| #50 `a1ddada9` | 2026-10-14 | Reject sidebar extracts without blocking quoted elisions. |
| #51 `15ad7a1e` + 25 fix commits | 2026-10-12 | Reader-copy guard on every reader-facing body; `--strict` added to the content gate. |
| #54 `cbde25d7` | 2026-10-16 | `%` figures followed by a space or punctuation were never extracted, so percent claims went unchecked. |
| #55 (closed, not merged) | — | Documents the Mac runner failure: step 4 `restore-eia-public-inventory.mjs` failed on every run since #48; "five failures at this step on 2026-10-12/13"; "since 2026-10-14 the Mac fails earlier, at `git fetch`, because of local repository corruption". Superseded by #56. |
| #56 `abb2b770` | 2026-10-16 | Source-derived claim ledger for the five EIA analyses (unblocks step 4); two columns quarantined because their sources are link-only (`allow_text_use: false`) and unreachable. Notes that 13 other columns have invalid source artifacts. |

Open PRs on 2026-10-17: #52 and #53 (EIA refresh retries, both draft-ish), #1
(Vercel analytics bot PR from May).

## Commit classes on `origin/main` since 2026-09-15 (283 commits)

| class | count |
|---|---|
| `chore: refresh public infrastructure data` (EIA lane) | 105 |
| `chore: refresh news surface and archive` (content cycle, Actions era, last 2026-10-05) | 68 |
| `fix:` | 64 |
| release | 22 |
| merge | 11 |
| `feat:` | 6 |
| docs / other | 7 |

Fix commits by subsystem (from subjects): reader-copy / QA gates 26 (all
2026-10-11), extraction boundaries 12, column engine 12, source fidelity and
claims 6, images 3, ops/runner 4, UI 2, dedupe/repetition 1. Source fixes:
none since 2026-09-15 (the last source repairs were PRs #33–#35 on
2026-09-10).

## Threshold and registry change commits (what moved the gates)

| date | commit | change |
|---|---|---|
| 2026-09-03 | `1d02959f`, `63550009`, `5c7cd306`, `c2be4690` | Public-domain wire intake restored; "honest relevance scoring"; fresh, source-capped pool; data-center-plus-grid relevance. |
| 2026-09-10 | `703391a2`, `646dd1de`, `97b31f11`…`f12cdb4c` | Rights-clean source expansion; ACER feed repair; abstract-only sources capped at the signal-card lane; Federal Register docket guard series. |
| 2026-10-04/05 | `27fc11d2`, `3a214223`, `5f80debd`, `26dd1059`, `9976129c`, `0ee22e0c` | Source scope widening; column selection resumed; throughput and floor changes listed above. |
| 2026-10-06 | `1fcd7023` | Generation moved to Mac subscription CLIs (`gpt-6-astra`, `claude-fable-5-1`). |
| 2026-10-11 | `396bd6f5`, `198c2b5c`, `bdefb096`, `d941ba50`, `e346dd2d` | Column copy guard, repetition opening-frame check, lead-boundary extraction fixes, reader-copy audit scope. |
| 2026-10-14 | `30be92bb` (#49 merge) | Repetition and column gates. |
