-- Compute Current rebuild — Phase 3c: per-axis reasons and the selection
-- verdict on candidates. Written with 0001_init.sql still unapplied (the
-- target project is undecided), so both files apply together; kept separate
-- so a project that already carries 0001 only needs this one.
--
-- `rubric` is NULL on normalize rejections (rubric_version normalize/<v>) and
-- set by the score stage (rubric_version score/<v>):
--   { "tier": "full" | "brief" | null,            -- null: below thresholds.brief
--     "rank": <1-based position among passing candidates> | null,
--     "insight_eligible": <insight_potential >= scoring.insight_trigger>,
--     "reasons": { "relevance": "...", "timeliness": "...", "impact": "...",
--                  "reader_value": "...", "insight_potential": "..." } }
-- The strict shape is `CandidateRubric` in packages/shared/src/schema/tables.ts.

begin;

alter table candidates add column rubric jsonb;

comment on column candidates.rubric is 'Phase 3c: tier, rank, insight_eligible and one human-readable reason per rubric axis (CandidateRubric); null on normalize rejections';

commit;
