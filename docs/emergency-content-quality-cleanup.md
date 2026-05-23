# Emergency Content Quality Cleanup

Emergency quality mode is enabled by default. Crawling and internal records can continue, but public publishing is fail-closed unless the item passes extraction, relevance, copy, homepage, detail, SEO, sitemap, and RSS quality gates.

Disable only with:

```sh
COMPUTE_CURRENT_DISABLE_EMERGENCY_QUALITY_MODE=true
```

Quarantined records are marked `public_status = "quarantined"`, hidden from homepage/detail pages, excluded from sitemap/RSS/search, and noindexed.
