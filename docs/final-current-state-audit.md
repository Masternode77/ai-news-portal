# Final Current-State Audit

Generated at: 2026-05-20T14:16:23.018Z

## Git and deployment

- current branch: main
- HEAD: ac186b12dc8066acf28baa7deb02ea4874d711e3
- origin/main: ac186b12dc8066acf28baa7deb02ea4874d711e3
- main matches origin/main: true
- working tree clean: false
- production homepage reachable: true
- Vercel deployment state observed: READY
- production aliases observed: www.computecurrent.com, computecurrent.com
- production cache header: HIT
- production last-modified: Wed, 20 May 2026 14:16:21 GMT

## Public surface counts

- baseline homepage visible count: 8
- baseline local article count: 2
- baseline source-card/direct-source count: 6
- baseline watchlist count: 2
- baseline archive-only/noindex/quarantined count: 417
- baseline search index size: 20

- current homepage visible count: 20
- current local article count: 20
- current source-card/direct-source count: 0
- current watchlist count: 0
- archive-only/noindex/quarantined count: 425
- sitemap entries: 55
- RSS items: 18
- search index size: 20
- public articles passing editorial_article_v2 gate: 0
- public articles failing editorial_article_v2 gate: 96
- homepage cards linking to local pages: 20
- homepage cards linking directly to sources: 0
- public HTML debug/schema phrase leaks: 0
- public route/category mismatches: 0

## Source health

- source health records: 29
- source domains producing clean evidence: none
- source domains producing extraction failures: datacenterknowledge.com (33), semiengineering.com (15), go.theregister.com (9), bloomberg.com (8), datacenterpost.com (8), techcrunch.com (6), storagereview.com (6), cloud.google.com (4), blogs.nvidia.com (1)
- source domains causing low relevance/archive routing: none
- source domains causing source scope failures: none

## Quarantine reason distribution

- not_selected_for_launch_surface: 1569
- pre_autonomous_editorial_desk: 382
- unclean_or_short_evidence: 168
- public_publish_quality_gate_failed: 88
- short_signal_not_counted_as_blog: 81
- stale_autonomous_editorial_desk_batch: 76
- low_value_non_infrastructure_topic: 57
- stale_autonomous_blog_writer_v1: 49
- ellipsis_truncation_artifact: 45
- relevance_below_adjacent_threshold: 41
- source_boilerplate_only: 33
- outside_compute_current_product_boundary: 25
- score_below_standard_blog_threshold: 17
- repeated_heading_sequence: 16
- repeated_paragraph: 11
- missing_limitation_or_counterargument: 11
- boilerplate_detected: 11
- insufficient_article_body: 10
- missing_concrete_infrastructure_layer: 10
- extraction_qa_failed: 4
- forbidden_ai_phrase:Evidence: 1
- single_letter_or_clo_sentence_fragment: 1
- incomplete_terminal:platfor: 1
- generic_non_infrastructure_topic: 1

## Diagnosis

- Baseline before launch edits was thin because only 8 latest records were homepage-visible and only 2 qualified as local public article records. The archive/noindex pool was 417 records.
- The previous regeneration produced 8 published / 42 quarantined because the v2 public gate correctly blocked stale template copy and source-quality failures, while the selection model did not backfill enough clean archived records into local routes.
- The dominant baseline blockers were not_selected_for_launch_surface (1557), pre_autonomous_editorial_desk (380), unclean_or_short_evidence (167), public_publish_quality_gate_failed (88), short_signal_not_counted_as_blog (80), stale_autonomous_editorial_desk_batch (71).
- Evidence points to a mix of source extraction quality, stale generated copy, and homepage selection. Source scope policy is doing useful damage control, but it is not the main reason for the thin homepage.
