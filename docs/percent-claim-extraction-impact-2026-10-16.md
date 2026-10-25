# Percent claim extraction: impact on committed content (2026-10-16)

Status: **resolved**. The owner approved the extractor change (merged in #54)
and paths A, B and C on 2026-10-16, with quarantine where re-extraction fails.
See [Resolution](#resolution-2026-10-16) for what was done.

## The defect

`extractNumericClaims` (`scripts/lib/autonomous-desk-utils.mjs`) ended its unit
alternation with `\b`. Because `%` is a non-word character, a `%` figure only
matched when a letter came straight after it (`50%of`). `1.9% in`, `50% increase`,
`79%,`, `about 10%` and a `%` at the end of the text were never extracted, so no
gate checked them. The word form (`12 percent`) worked.

The fix makes `%` its own alternative with no trailing boundary. Word units keep
`\b`, so `percentile` and `percentage points` still do not match. `%` and
`percent` already canonicalize to the same key (`numeric-claim-policy.mjs`).

Affected consumers: `unsupported-claim-guard.mjs`, `source-fidelity-claim-check.mjs`
(body and SEO metadata), `numeric-claim-policy.mjs` keys, `claim-extractor.mjs` /
`claim-ledger.mjs`, `blog-claim-ledger.mjs`, `authored-column-figures.mjs`,
`expert-insight-engine.mjs`, `evidence-pack-builder-v2.mjs`, `global-source-scan.mjs`.

## Method

The inventory was measured at `da7df3d` (origin/main), twice: once unfixed and
once with only the extractor change. Each run used its own git worktree, so the
committed data was never rewritten. The two snapshots were then diffed.

| Check | How it was run |
| --- | --- |
| `finalPublicationIntegrityResult` | Every record that needs final-body review in `latest-news.json`, `archived-news.json` and `search-index.json`, with the same comparison-window progression as `enforceFinalPublicationIntegrity`. Run with and without the source registry. |
| `enforceFinalPublicationIntegrity` | Applied to `latest-news.json`, as the pipeline's `writeJsonFile` and `archive-store` do. |
| `restore-eia-public-inventory.mjs` | Real run. Live EIA fetch was refused by the sandbox proxy, so it reused the committed text. A per-record probe repeated `verifyAndStamp` without stopping at the first failure. |
| `authored-columns.json` | `columnArtworkReadiness` (the Mac column-image gate). Also ran `unsupportedClaimGuard` against a ledger rebuilt from each column's source records, and compared each body `%` with the stored source text. |
| Audits | `audit-reader-copy --strict`, `audit-public-article-quality`, `audit-public-copy`, `audit-public-homepage`, `audit-public-feed-volume`, `test-quality-gate`, `prepare-codex-images`. |

## Result: no record changes from pass to fail

The stricter extractor does not change any gate's outcome. Every record where it
finds a new unbacked `%` is already blocked on `main` for another reason.

| Gate | Before | After |
| --- | --- | --- |
| `enforceFinalPublicationIntegrity(latest-news)` | 5 blocked (all live EIA longforms) | same 5 blocked |
| `restore-eia-public-inventory.mjs` | exit 1 on `eia-data-center-load-timing` | exit 1 on the same record (message now lists the `%` figures) |
| `columnArtworkReadiness` (22 columns) | 5 pass / 17 fail | 5 pass / 17 fail, no flips |
| `archived-news.json` (1,020) | 0 records need final-body review | 0 |
| `search-index.json` EIA copies | 5 pass | 5 pass |
| The six audits and `prepare-codex-images` | pass / 0 queued jobs | identical output (timestamp aside) |

### Problem already on `main`: EIA restoration (blocks the Mac runner today)

`eia-restoration-inventory.mjs` builds every restoration record with
`claim_ledger: []`. Commit `93341dd` ("correct published articles from stored
sources", 2026-10-11) added years, MW and $ figures to the bodies in
`config/eiaRestorationArticles.json` and `latest-news.json`. With an empty
ledger every number counts as unbacked. Since then:

- `restore-eia-public-inventory.mjs` throws on its first longform. That is step 4
  of `scripts/run-subscription-news.mjs`, so **the Mac subscription runner is
  already blocked on `main`**, with or without this fix. (Verified: restoring the
  spec from `93341dd^` makes the script pass again.)
- `writeJsonFile(latest-news.json)` in the pipeline (step 2) would quarantine all
  five live EIA longforms.
- `search-index.json` still holds the pre-`93341dd` EIA bodies, so it is out of
  sync with `latest-news.json`.

## Records with new unbacked percentages

Once the existing blockers are fixed, these figures will be checked. "In source"
means the record's own verified source text contains the same value, unit and
qualifier.

### EIA longforms (live, `articlePagePublished: true`)

| Record | Percent figures the gate now sees | Against source text |
| --- | --- | --- |
| `eia-data-center-load-timing`: Data-center load is turning spare generation into a timing problem | 1.9%, 2.5%, **about 10%**, 3%, 50%, 79%, 4%, 40%, 7.3%, 1.7%, 17%, 5.0%, 9.3%, 18% | 13 in source. **`about 10%` adds a qualifier**: the source says load growth "averages 10%". This also raises source-fidelity unsupported sentences from 3 to 4. |
| `eia-server-cooling-forecast`: Cooling makes server growth a two-part electricity forecast | 10% | in source |
| `eia-virginia-peak-load`: Virginia's commercial power growth is becoming a peak-load test | 23%, 45%, 5.4%, 6.3% | all in source |
| `eia-texas-large-loads`: Texas needs to distinguish approved large loads from live demand | about 65%, 32%, 50%, 1%, 10%, 5%, 11%, 17% | all in source |
| `eia-nuclear-data-center-contracts` | none | n/a |

No EIA title, deck, summary or meta description contains a `%` figure.

### Authored columns (live through stored `authored_quality.ok`)

| Column | Percent figures | Against source |
| --- | --- | --- |
| `col_4dd46fdfbc30fd72`: Intel's integrated workstation GPU could be an edge-inference cost story | 68%, about 3% (twice). `55 percent` was already flagged before the fix. | All appear in the stored `articleText` of source `afb38d125df0c4c6`, but that record has no valid extraction artifact, so the gate cannot verify them. |
| `col_4425d817371fe825`: Amazon's Texas gas plant is a queue-jumping move, not a climate story | 16% | In the stored `articleText` of source `ddb3c065c105e647`. No valid extraction artifact. |
| `col_5be9ec4d110578c9`: Up to 3× pod density is a benchmark, not a RAM budget cut | over 40% (twice) | Backed by a valid artifact. Passes before and after. |

Both unverifiable columns belong to a larger group: 15 of 22 columns already
fail `columnArtworkReadiness` on `main` with `extraction_artifact_invalid` for
their source records. Years, MW and $ figures in those columns are equally
unverifiable today.

## Options

| Path | What it does | Trade-off |
| --- | --- | --- |
| A. Fix copy | Change "an average of about 10%" to "an average of 10%" in the `eia-data-center-load-timing` spec and the live record | One-word correction that matches the source. Required under any path, because the fidelity check rejects the added qualifier. |
| B. Extend ledgers (EIA) | Build the EIA restoration `claim_ledger` from the verified EIA text instead of `[]` | Clears the existing blocker for 26 of 27 `%` figures plus the years, MW and $ figures. It must cover the whole source; the 8-sentence / 18-claim `buildClaimLedger` budget is too small for these articles. Changes gate inputs, so the owner must approve it. |
| C. Re-extract (columns) | Re-fetch and re-extract the source articles behind the 15 columns with invalid artifacts | Makes those columns verifiable again. Depends on source availability and text rights. |
| D. Quarantine | Unpublish whatever cannot be backed after A–C | Last resort. Not needed for any `%` figure measured here, since every one appears in stored source text. |

## Recommendation

1. Merge the extractor fix after the owner signs off. On its own it blocks no
   record and does not change the Mac runner's outcome, which is already failing.
2. Separately, fix the EIA problem that is already on `main`: path A plus path B,
   then rerun `restore-eia-public-inventory.mjs`, re-sync `search-index.json`, and
   restamp `publication_integrity` on the five records.
3. Columns: path C for `col_4dd46fdfbc30fd72` and `col_4425d817371fe825`, then
   rerun `columnArtworkReadiness`. Quarantine (D) only where the source cannot be
   re-extracted.

Do not weaken any gate, edit `publication_integrity`, or relabel ledger rows to
make these records pass.

## Not covered

- Live production commit check: the Vercel API returned 403 for the project scope
  and `computecurrent.com` was unreachable from the sandbox, so production
  alignment with `da7df3d` is unconfirmed.
- Live EIA text: the restore runs used the committed text, which is the script's
  designed offline fallback.
- Ranges with one shared unit (`10–20%`, `10 and 20 percent`) still extract only
  the second value. This gap existed before the fix and is a follow-up.

## Resolution (2026-10-16)

**EIA restoration (paths A and B).**

- `eia-restoration-inventory.mjs` now builds each analysis's `claim_ledger` from
  the verified EIA text. Every row quotes the EIA sentence that states a figure
  the body uses. A body figure the source does not state still has no row, so
  it still blocks publication.
- The extractor reads EIA's `BkWh` (billion kilowatthours) and gives it the same
  key as "billion kWh". No published body or metadata uses `BkWh`, so this only
  adds source-side evidence.
- Copy corrections in `config/eiaRestorationArticles.json`. All of them are
  grounded in the stored EIA text:
  - `eia-data-center-load-timing`:
    - "about 10%" becomes "10%" (the source says load growth "averages 10%").
    - "roughly $1.30 to $3.00 per MWh elsewhere" becomes "$1.30 to $3.00 per MWh
      in California, the Southwest, New England and New York". The source gives
      $1.30 for California and the Southwest and $3.00 for New England and New York.
    - The outlook attribution is reworded so the source-fidelity actor check does
      not treat "The EIA" as an unsupported name.
  - `eia-texas-large-loads`:
    - "14,200 MW" becomes "about 14,200 MW", the source's qualifier.
    - "a September Short-Term Energy Outlook" becomes "the September STEO", the
      source's term.
- Correction notes and `updatedAt` now live in the spec, so a restore keeps them.
  The 2026-10-11 notes were copied over, and a 2026-10-16 note was added to the
  two corrected analyses.
- After rerunning `restore-eia-public-inventory.mjs`, it exits 0 and is
  idempotent. All five analyses pass `finalPublicationIntegrityResult`.
  `enforceFinalPublicationIntegrity` blocks no record in `latest-news.json`,
  `search-index.json` or `archived-news.json`. `search-index.json` now carries
  the corrected bodies.
- `tests/eia-public-restoration.test.mjs` builds the analyses from the committed
  source text and requires them to pass the final gate. A body figure the source
  does not state must keep its analysis blocked.

**Columns (path C, then D).**

Re-extraction is not possible for either source:

- `afb38d125df0c4c6` (StorageReview) and `ddb3c065c105e647` (TechCrunch AI) are
  registered as link-only (`allow_text_use: false`, reviewed 2026-09-05), so a
  new extraction would still fail `currentSourceTextAuthorization`. Changing
  those rights is a separate rights decision and was not made here.
- Neither host was reachable from the sandbox.

`col_4dd46fdfbc30fd72` and `col_4425d817371fe825` were quarantined with
`quarantineArticle` and the reasons `source_rights:text_use_not_authorized:<source>`
and `extraction_artifact:missing_or_invalid:<record>`. They no longer render as
column pages, cards, catalog, RSS or sitemap entries, so public columns go from
22 to 20 and the archive route from 64 to 62 records. Bodies, figures and artwork
registrations are kept, so the quarantine can be reversed if text rights are
granted later.

**Remaining 13 columns (2026-10-23).** The owner then asked for the same rule
to be applied to the other 13 columns whose source records have no valid
extraction artifact: try re-extraction, and quarantine if it fails.

For each source record, `fetchAuthorizedSourceText` was called through the
source registry. All 13 attempts were denied with `text_use_not_authorized`.
Every source is registered link-only (`allow_text_use: false`, reviewed
2026-09-05), and several rights notes rule out fetching article text outright:

| Source | Columns | Rights note (registry) |
| --- | --- | --- |
| Bloomberg Technology | `col_776dcf6e9c89b581` | ask first; noncommercial-only licence, scraper ban |
| TechCrunch AI | `col_13e55e0a75a620db` | link-only: feed content as shipped with attribution |
| HPCwire | `col_fca83bb71323a3ba`, `col_b6074069a1555367`, `col_f73d297e3be9969c` | terms ban data mining and commercial exploitation |
| StorageReview | `col_69cab7b291d16a59`, `col_ad15e2d4c145e30d` | link-only; default copyright |
| ServeTheHome | `col_24b7abd6a12c5e63` | link-only: up to 300 characters plus one image |
| Tom's Hardware | `col_4af3df9a2131c335`, `col_3dbd354c8bc9107d` | link-only; no commercial use without a licence |
| Semiconductor Engineering | `col_7c5e4b3b0b775337`, `col_414c93d7b5969906` | non-commercial personal viewing only, no copying |
| NVIDIA Blog | `col_292b67321a052acf` | scraper clause forbids fetching article pages |

None of the eight hosts was reachable from the sandbox either. All 13 columns
were quarantined with `quarantineArticle`, using the same reason format as
above. Public columns go from 20 to 7, and the archive route from 62 to 49
records. As before, bodies, figures and artwork registrations are kept.

**ERCOT and Hormuz columns (2026-10-23).** The owner asked for the two
remaining columns that failed numeric provenance to be corrected against their
EIA sources, and quarantined if that is not possible.

- `col_55e9ccd7116252dd` (ERCOT) was **corrected**. The EIA source does not
  report the energization and moratorium dates in the body (2027, 2028, and a
  twelve-month clearance), so those passages were rewritten as conditions to
  watch. A 2026-10-23 correction note was added. The column now passes
  `columnArtworkReadiness`, which covers numeric provenance, length, style and
  repetition, and the reader-copy guard.
- `col_ba22f5ea8bef96e6` (Hormuz) was **corrected and quarantined**:
  - Corrections: a derived $46 swing and a fourfold comparison (the EIA gives
    the $118 and $72 endpoints and the $4 versus $1 daily swings) were rewritten
    from the reported figures, and two watch-list dates the EIA did not report
    were removed.
  - Why it is still quarantined: the remaining flagged figures (2026, $4, $1,
    2025) all appear in the EIA text, but the gate does not accept them.
    `verifyNumericClaim` marks a value `verified_multi_source` whenever its digits
    appear anywhere in more than one source, and the numeric gate accepts only
    `verified_primary`. Removing those figures would remove the column's core
    evidence, so the column was quarantined instead.
  - Restoring it: the corrected body is kept, and the column can be restored if
    the gate is changed to accept multi-source-verified claims.

All six remaining public columns now pass `columnArtworkReadiness`.

**Multi-source classification (2026-10-25).** The owner approved fixing the
classification defect that kept the Hormuz column out of the gate. The gate
itself is unchanged: it still accepts only `verified_primary` rows whose quote
states the figure and that name a source URL. Two defects decided which rows
got that status:

- `verifyNumericClaim` counted a source as corroborating whenever the raw
  digits appeared anywhere in it, so "$4" matched "2014" and "8 million"
  matched "118". It also ranked corroboration above `verified_primary`, so a
  figure that two sources state (a year such as 2026) left the gate. A source
  now corroborates only when it states the same value, unit and qualifier
  (`numericClaimKey`), and a claim quoted from the source it cites stays
  `verified_primary`, with confidence 0.94 instead of 0.88 when corroborated.
  `verified_multi_source` remains only for a claim with no source URL.
- `attachSecondaryVerification` credited every claim without a named entity
  to the secondary source (every text includes the empty string), and moved
  credited claims to `verified_secondary`, which the gate also excludes. It
  now needs a named entity and records the secondary source without changing
  the status.

Measured on the committed inventory before and after the change: no news,
archive or search-index record changes result, the five EIA restoration
records still pass, the six public columns still pass `columnArtworkReadiness`,
and `col_ba22f5ea8bef96e6` (Hormuz) now passes it with no reasons. Every figure
in its corrected body is backed by an EIA sentence. The column stays
quarantined until the owner approves restoring it in a separate change.
