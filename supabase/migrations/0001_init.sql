-- Compute Current rebuild — initial schema (ADR-003, ADR-004, ADR-007).
-- Phase 2 deliverable: written, reviewed, NOT applied. Applying it is a
-- §5.6 pre-approval item (brief) and needs the target project decided
-- (existing project with the legacy `archived_articles` table left untouched,
-- or a new project). Apply with `supabase db push` or the SQL editor.
--
-- Reconciliations against the ADR tables, noted here so reviewers see them:
--   * drafts.review_status  (ADR-004 human-review queue) added to the ADR-003 column list.
--   * pipeline_runs.flags   (contracts.md §7 flag snapshot) added.
--   * dead_letters          unique per (run_id, stage, ref_id) so the same item can
--                           fail in several runs with its own retry_count.
--   * redirects             readable by anon (target.md §1: the site reads publications
--                           and redirects); every other table stays service-role only.

begin;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
create type cc_source_type as enum ('rss', 'html', 'api');
create type cc_text_rights as enum ('full', 'rewrite_only', 'link_only');
create type cc_content_type as enum ('news_brief', 'insight_essay', 'legacy_analysis');
create type cc_run_status as enum ('started', 'partial', 'done', 'failed', 'budget_stop');
create type cc_run_trigger as enum ('schedule', 'dispatch', 'local');
create type cc_stage_name as enum ('ingest', 'normalize', 'score', 'generate', 'qa', 'image', 'publish');
create type cc_stage_status as enum ('started', 'done', 'skipped', 'error');
create type cc_severity as enum ('hard', 'soft');
create type cc_publication_status as enum ('published', 'unpublished', 'quarantined');
create type cc_review_status as enum ('none', 'pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- sources (mirror of config/sources.yaml plus runtime health)
-- ---------------------------------------------------------------------------
create table sources (
  id            text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  name          text not null,
  type          cc_source_type not null,
  url           text not null,
  tier          smallint not null check (tier between 1 and 3),
  enabled       boolean not null default true,
  text_rights   cc_text_rights not null,
  terms_url     text,
  reviewed_at   date,
  last_ok_at    timestamptz,
  fail_streak   integer not null default 0 check (fail_streak >= 0),
  health        jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- pipeline_runs / stage_events / dead_letters (ADR-007: ledger written first)
-- ---------------------------------------------------------------------------
create table pipeline_runs (
  id              uuid primary key,
  started_at      timestamptz not null,
  ended_at        timestamptz,
  status          cc_run_status not null default 'started',
  trigger         cc_run_trigger not null,
  funnel          jsonb,
  cost_total_usd  numeric(10, 4) not null default 0 check (cost_total_usd >= 0),
  error           text,
  git_sha         text,
  flags           jsonb
);
create index pipeline_runs_started_at_idx on pipeline_runs (started_at desc);
create index pipeline_runs_status_idx on pipeline_runs (status);

create table stage_events (
  id          bigserial primary key,
  run_id      uuid not null references pipeline_runs (id) on delete cascade,
  stage       cc_stage_name not null,
  status      cc_stage_status not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  counts      jsonb not null default '{}'::jsonb,
  error       text,
  unique (run_id, stage, started_at)
);
create index stage_events_run_id_idx on stage_events (run_id);

-- ---------------------------------------------------------------------------
-- raw_items — idempotency: unique(canonical_url)
-- ---------------------------------------------------------------------------
create table raw_items (
  id                   uuid primary key default gen_random_uuid(),
  source_id            text not null references sources (id),
  canonical_url        text not null unique,
  content_hash         char(64) check (content_hash ~ '^[a-f0-9]{64}$'),
  title                text not null,
  published_at_source  timestamptz,
  fetched_at           timestamptz not null default now(),
  payload              jsonb not null default '{}'::jsonb,
  run_id               uuid references pipeline_runs (id)
);
create index raw_items_source_id_idx on raw_items (source_id);
create index raw_items_fetched_at_idx on raw_items (fetched_at desc);

-- ---------------------------------------------------------------------------
-- candidates — idempotency: unique(raw_item_id, rubric_version)
-- ---------------------------------------------------------------------------
create table candidates (
  id              uuid primary key default gen_random_uuid(),
  raw_item_id     uuid not null references raw_items (id) on delete cascade,
  run_id          uuid not null references pipeline_runs (id),
  rubric_version  text not null,
  scores          jsonb not null,
  total           numeric(5, 4) not null check (total between 0 and 1),
  selected        boolean not null default false,
  reject_reason   text,
  created_at      timestamptz not null default now(),
  unique (raw_item_id, rubric_version)
);
create index candidates_run_id_idx on candidates (run_id);
create index candidates_selected_idx on candidates (selected) where selected;

-- ---------------------------------------------------------------------------
-- drafts — idempotency: unique(candidate_id, content_type, prompt_version)
-- ---------------------------------------------------------------------------
create table drafts (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references candidates (id) on delete cascade,
  run_id          uuid not null references pipeline_runs (id),
  content_type    cc_content_type not null,
  prompt_version  text not null,
  model           text not null,
  body            jsonb not null,
  input_tokens    integer not null default 0 check (input_tokens >= 0),
  output_tokens   integer not null default 0 check (output_tokens >= 0),
  cost_usd        numeric(10, 4) not null default 0 check (cost_usd >= 0),
  review_status   cc_review_status not null default 'none',
  created_at      timestamptz not null default now(),
  unique (candidate_id, content_type, prompt_version)
);
create index drafts_run_id_idx on drafts (run_id);
create index drafts_review_status_idx on drafts (review_status) where review_status = 'pending';

-- ---------------------------------------------------------------------------
-- qa_results — every verdict, with reason_code (R6); unique(draft_id, rule, checked_at)
-- ---------------------------------------------------------------------------
create table qa_results (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references drafts (id) on delete cascade,
  rule         text not null,
  severity     cc_severity not null,
  pass         boolean not null,
  reason_code  text not null,
  evidence     jsonb not null default '{}'::jsonb,
  checked_at   timestamptz not null default now(),
  unique (draft_id, rule, checked_at)
);
create index qa_results_draft_id_idx on qa_results (draft_id);
create index qa_results_rule_pass_idx on qa_results (rule, pass);

-- ---------------------------------------------------------------------------
-- publications — the only table the site reads; idempotency: unique(slug)
-- ---------------------------------------------------------------------------
create table publications (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid references drafts (id),
  slug          text not null unique check (slug ~ '^(news|column)/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  content_type  cc_content_type not null,
  title         text not null,
  body          jsonb not null,
  image         jsonb,
  sources       jsonb not null default '[]'::jsonb,
  published_at  timestamptz not null,
  updated_at    timestamptz not null default now(),
  publisher     text not null,
  status        cc_publication_status not null default 'published',
  legacy_id     text,
  noindex       boolean not null default false,
  tags          text[] not null default '{}',
  category      text,
  region        text,
  search        tsvector generated always as (
                  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body ->> 'summary_ko', '') || ' ' || coalesce(body ->> 'deck', ''))
                ) stored
);
create index publications_published_at_idx on publications (published_at desc);
create index publications_type_published_at_idx on publications (content_type, published_at desc);
create index publications_status_idx on publications (status);
create index publications_legacy_id_idx on publications (legacy_id) where legacy_id is not null;
create index publications_search_idx on publications using gin (search);

create or replace function cc_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger publications_set_updated_at
  before update on publications
  for each row execute function cc_set_updated_at();

-- ---------------------------------------------------------------------------
-- dead_letters (P5: item-level failures never stop the run)
-- ---------------------------------------------------------------------------
create table dead_letters (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references pipeline_runs (id) on delete cascade,
  stage        cc_stage_name not null,
  ref_table    text not null,
  ref_id       text not null,
  payload      jsonb not null default '{}'::jsonb,
  error        text not null,
  retry_count  integer not null default 0 check (retry_count >= 0),
  created_at   timestamptz not null default now(),
  unique (run_id, stage, ref_id)
);
create index dead_letters_run_id_idx on dead_letters (run_id);

-- ---------------------------------------------------------------------------
-- redirects (R8 legacy URL preservation)
-- ---------------------------------------------------------------------------
create table redirects (
  from_path  text primary key check (from_path like '/%'),
  to_path    text not null check (to_path like '/%'),
  status     smallint not null check (status in (301, 410))
);

-- ---------------------------------------------------------------------------
-- Row level security: anon reads published publications and redirects only;
-- the pipeline uses the service role (bypasses RLS) from GitHub Actions secrets.
-- ---------------------------------------------------------------------------
alter table sources        enable row level security;
alter table pipeline_runs  enable row level security;
alter table stage_events   enable row level security;
alter table raw_items      enable row level security;
alter table candidates     enable row level security;
alter table drafts         enable row level security;
alter table qa_results     enable row level security;
alter table publications   enable row level security;
alter table dead_letters   enable row level security;
alter table redirects      enable row level security;

create policy publications_anon_read_published
  on publications for select
  to anon, authenticated
  using (status = 'published');

create policy redirects_anon_read
  on redirects for select
  to anon, authenticated
  using (true);

commit;
