# Operations monitor

The hourly `Operations Monitor` workflow checks two independent conditions and maintains one reusable GitHub issue per condition.

## Content pipeline freshness

The monitor reads the GitHub Actions run history for `.github/workflows/update-news.yml`. Freshness is based on the most recent run whose conclusion is `success`, rather than the latest attempt. A successful run older than 12 hours raises an alert. A more recent failed completed run is reported as `stale_after_failed_scan`; a stale success without a later failure is `stale_no_recent_success`. No run history is `unknown_no_runs`, not healthy.

The current source registry is also evaluated with the same authorization rules as the pipeline. Zero active text-authorized feeds is reported separately as `no_authorized_sources`, so an authorization stop is not described as a scan failure.

## OpenRouter monthly budget

Set the repository Actions variable `OPENROUTER_MONTHLY_BUDGET_USD` to the approved monthly budget in US dollars. The approved launch value is `30`, which raises the default warning at $24 and the critical alert at $30. There is intentionally no fallback financial limit in code. The monitor uses the existing `OPENROUTER_API_KEY` Actions secret to call `GET https://openrouter.ai/api/v1/key` and reads the documented `data.usage_monthly` field.

The endpoint measures spending for the configured API key, not every key in the account. Use this key exclusively for this publication; separate keys require separate aggregation.

The warning threshold defaults to 80%. Set the optional Actions variable `OPENROUTER_BUDGET_WARNING_PERCENT` to another value greater than 0 and less than 100. At 100% the state becomes critical. The monitor only alerts; it never disables keys or stops production globally.

Missing budget configuration, missing credentials, malformed usage, and API failures are `unknown` states. They are never treated as zero usage or healthy. Issue text contains only the percentage of the configured budget used, not the API key or raw spend and budget amounts.

## Issue lifecycle and failure behavior

Each monitor uses a stable marker in its issue body. An unchanged state performs no issue write. A state transition updates the existing issue. Recovery closes it with a recovered state, and a recurrence reopens the same issue instead of creating a replacement. The two checks run independently; a retrieval or issue-sync failure in one does not prevent the other from running. Unexpected retrieval or synchronization errors set a nonzero process exit code after both checks complete, while ordinary alert and configuration-unknown states are represented by issues without failing the workflow.

The workflow token has only `actions: read`, `contents: read`, and `issues: write`. It runs at minute 17 each hour with a five-minute timeout and a non-canceling concurrency group.

For a manual no-write check, run the workflow with `dry_run` enabled. Locally, `node scripts/check-operations.mjs --dry-run` performs the same evaluation and makes no issue mutations, but it still requires GitHub repository/token values to read run and issue state.

## API references

- [GitHub workflow runs API](https://docs.github.com/en/rest/actions/workflow-runs)
- [GitHub Actions workflow permission syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [OpenRouter current API key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)
