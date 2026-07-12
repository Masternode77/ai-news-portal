create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists admin_users (
  id text primary key,
  username text not null unique,
  password_hash text,
  role text not null check (role in ('admin', 'editor')),
  two_factor_enabled boolean not null default false,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id text primary key,
  user_id text not null references admin_users(id),
  role text not null check (role in ('admin', 'editor')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_login_attempts (
  id text primary key,
  ip_hash text not null,
  username text not null default '',
  success boolean not null default false,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists admin_login_attempts_ip_created_idx
  on admin_login_attempts (ip_hash, created_at desc);

create table if not exists admin_articles (
  id text primary key,
  version integer not null check (version > 0),
  article jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create index if not exists admin_articles_deleted_at_idx
  on admin_articles (deleted_at);

create table if not exists admin_article_revisions (
  id text primary key,
  article_id text not null,
  version integer not null check (version > 0),
  previous_version integer,
  action text not null,
  actor jsonb not null,
  article jsonb not null,
  created_at timestamptz not null,
  unique (article_id, version)
);

create index if not exists admin_article_revisions_article_id_idx
  on admin_article_revisions (article_id, version);

create table if not exists admin_audit_log (
  id text primary key,
  article_id text not null,
  action text not null,
  actor jsonb not null,
  before_article jsonb,
  after_article jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create index if not exists admin_audit_log_article_id_idx
  on admin_audit_log (article_id, created_at);

create index if not exists admin_audit_log_action_idx
  on admin_audit_log (action, created_at);

create or replace function reject_admin_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin history is append-only';
end;
$$;

drop trigger if exists admin_article_revisions_append_only on admin_article_revisions;
create trigger admin_article_revisions_append_only
before update or delete on admin_article_revisions
for each row execute function reject_admin_history_mutation();

drop trigger if exists admin_audit_log_append_only on admin_audit_log;
create trigger admin_audit_log_append_only
before update or delete on admin_audit_log
for each row execute function reject_admin_history_mutation();

create table if not exists admin_sources (
  id text primary key,
  name text not null,
  canonical_url text,
  configuration jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_source_items (
  id text primary key,
  source_id text not null references admin_sources(id),
  source_url text not null,
  payload jsonb not null,
  discovered_at timestamptz not null,
  unique (source_id, source_url)
);

create table if not exists admin_source_health (
  id text primary key,
  source_id text not null references admin_sources(id),
  status text not null,
  detail jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null
);

create table if not exists admin_clusters (
  id text primary key,
  label text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_categories (
  id text primary key,
  name text not null unique,
  slug text not null unique
);

create table if not exists admin_tags (
  id text primary key,
  name text not null unique,
  slug text not null unique
);

create table if not exists admin_entities (
  id text primary key,
  name text not null,
  kind text not null,
  canonical_key text not null unique
);

create table if not exists admin_article_categories (
  article_id text not null references admin_articles(id) on delete cascade,
  category_id text not null references admin_categories(id) on delete cascade,
  primary key (article_id, category_id)
);

create table if not exists admin_article_tags (
  article_id text not null references admin_articles(id) on delete cascade,
  tag_id text not null references admin_tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create table if not exists admin_article_entities (
  article_id text not null references admin_articles(id) on delete cascade,
  entity_id text not null references admin_entities(id) on delete cascade,
  primary key (article_id, entity_id)
);

create table if not exists admin_pipeline_runs (
  id text primary key,
  phase text not null,
  status text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz not null,
  finished_at timestamptz
);

create table if not exists admin_publication_states (
  article_id text primary key references admin_articles(id) on delete cascade,
  state text not null,
  scheduled_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists admin_publication_outbox (
  id text primary key,
  article_id text not null,
  action text not null,
  article_version integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index if not exists admin_publication_outbox_pending_idx
  on admin_publication_outbox (processed_at, created_at);

create table if not exists admin_quarantine_reasons (
  id text primary key,
  article_id text not null references admin_articles(id) on delete cascade,
  reason_code text not null,
  detail jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists admin_media (
  id text primary key,
  article_id text references admin_articles(id) on delete set null,
  object_key text not null unique,
  content_type text not null,
  byte_size integer not null check (byte_size > 0),
  width integer,
  height integer,
  checksum text not null,
  alt_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
