# Infrastructure data operations

Compute Current publishes three source-linked infrastructure datasets under `src/data/grid/`. They are decision-support references. A demand observation is not proof that the load is AI-specific, planned generation is not firm capacity, and a large-load application is not an operating facility.

## EIA-930 hourly demand

`demand.json` contains hourly balancing-authority demand for ERCOT (`ERCO`), PJM and Arizona Public Service (`AZPS`) from the EIA API. Records use UTC timestamps and MWh. The refresh validates the requested demand dimension, respondent set, unit, numeric value, timestamp and uniqueness before replacing the prior snapshot.

Scheduled demand refresh requires the `EIA_API_KEY` GitHub Actions secret. When the key is absent or the API request fails, the refresh reports the dataset as unavailable, exits unsuccessfully and retains the previous validated snapshot. The public page must keep the retained observation date visible; it must not turn an unavailable refresh into a zero value.

## EIA-860M planned capacity

`capacity.json` is parsed from a verified EIA-860M `Planned` worksheet. Each row is keyed by plant ID and generator ID and reports net summer capacity in MW, planned operation year and month, state, technology and status. Missing capacity remains `null` and contributes to `missingCapacityCount`; it is never converted to zero. The source workbook hash is retained for provenance.

The July 2026 source workbook currently parses to 2,341 planned-unit rows. That count excludes worksheet headings and column headers. Counts and capacity totals will legitimately change with later monthly editions, so automated tests enforce dimensions, uniqueness, date ranges, missing-value accounting and aggregate consistency rather than freezing those values.

## ERCOT large-load snapshot

`ercot.json` is a manually reviewed historical snapshot from page 4 of ERCOT’s April 2026 monthly report. It is not live queue ingestion. The stage values describe applications through 2033 and sum to the reported total in GW. They do not represent current demand, utility commitments or firm capacity. `asOf`, `reviewedAt`, `sourceUrl` and `sourcePage` keep that provenance explicit until a newer snapshot is manually sourced and validated.

## Refresh and validation

The scheduled workflow runs `node scripts/refresh-infrastructure-data.mjs`. EIA-930 and EIA-860M refresh independently, write through temporary files, and retain the prior validated file when one source fails. It then validates the resulting snapshots before committing changes.

Run both validation suites locally:

```sh
node --test tests/infrastructure-data.test.mjs
python3 -m unittest discover -s tests -p test_eia860_parser.py
```

The Node suite covers API dimensions and units, duplicate and missing observations, date labeling, CSV formula injection, capacity aggregation and stable snapshot invariants. The Python suite creates small XLSX fixtures in a temporary directory to exercise worksheet parsing, required headers, duplicate generator keys, missing capacity and invalid numeric or calendar values without relying on a network download.

The September 6 integration check retained the July capacity workbook after a newer-workbook fetch failed. Future-dated editions are excluded from discovery. The public inventory date, rather than the page deployment date, is the source of truth.
