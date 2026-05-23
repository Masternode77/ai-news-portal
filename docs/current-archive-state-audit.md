# Current Archive State Audit

Generated at: 2026-05-20T01:22:12.060Z

## Current Counts

- totalCrawledItems: 359
- totalArchivedItems: 355
- totalHomepageVisibleItems: 4
- totalLocalComputeCurrentArticlePages: 0
- totalSourceOnlyDirectLinkCards: 4
- totalItemsBlockedByExtractionQa: 352
- totalItemsBlockedByRelevanceClassifier: 90
- totalItemsBlockedByArticlePagePublishedFalse: 359
- totalItemsWithHomepagePublishedFalse: 355
- totalItemsWithArchiveOnlyTrue: 355
- totalItemsWithNoindexTrue: 359
- currentHomepageLocalBlogCount: 0

## Why Homepage Local Blog Count Is Below 20

Current homepage local blog count is 0. The public surface is below 20 because the emergency cleanup marked 359 items noindex, 359 items as articlePagePublished false, and 355 items archiveOnly. Those are data-store facts from src/data/latest-news.json and src/data/archived-news.json.

## Blocker Breakdown

- extraction_quality_score below threshold: 151
- relevance_score below threshold: 98
- articlePagePublished false: 359
- homepagePublished false: 355
- source evidence too short or dirty: 352
- boilerplate detected: 45
- truncation detected: 14
- missing local slug: 0
- stale generation version: 359
- direct-source-only route: 4

## Recovery Direction

The next pass should keep extraction, relevance, boilerplate, and truncation gates, but route clean relevant items into Core Longform Blog or Standard Blog instead of leaving every safe-but-imperfect item as source-only or archive-only.
