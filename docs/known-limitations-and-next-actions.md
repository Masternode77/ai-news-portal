# Known Limitations and Next Actions

## Known Limitations

- The launch corpus is source-derived and AI-assisted; it is not original reporting.
- Source freshness depends on feed and sitemap availability.
- Some high-quality sources have imperfect feed coverage or require adapter-specific extraction work.
- Cache purge may be skipped locally unless purge hook environment variables are configured.

## Next Actions

- Add source-specific adapters for high-value sources with weak extraction.
- Expand multi-source clustering for power, colocation, silicon, and cloud-capacity stories.
- Add a real newsletter backend behind `NEWSLETTER_API_URL` and `NEWSLETTER_API_KEY`.
- Add deeper production monitoring for sitemap, RSS, and article-page regressions.
