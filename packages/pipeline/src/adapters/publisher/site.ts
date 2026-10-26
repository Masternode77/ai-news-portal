/**
 * Site publisher (Phase 3h, ADR-005): a publication is a `publications` row,
 * nothing else. The site renders rows at request time behind ISR, so publishing
 * never waits for — or depends on — a site build. The three jobs here:
 *
 *   publish        upsert one row keyed by slug. A re-run of the same draft
 *                  updates the row in place (same id, first `published_at` kept).
 *                  A slug already written by a *different* draft follows
 *                  `publish.slug_conflict`: update (default), skip or fail.
 *   syncRedirects  upsert `config/redirects.yaml` into `redirects` (R8: old URLs
 *                  keep answering 301/410 from data, not from vercel.json).
 *   revalidate     on-demand ISR refresh of the published paths with the
 *                  `x-prerender-revalidate` bypass token (name-only config,
 *                  value from the environment). Off until the Phase 4 preview;
 *                  a failure is counted and logged, never thrown — ISR expires
 *                  within 300 s on its own (ADR-005).
 *
 * The adapter writes through `ctx.adapters.db` (memory in dry-run, Supabase
 * staging/production later) and reaches the network only through `ctx.fetch`.
 */
import { PublicationInsert, PublicationRow, publicationId } from "@cc/shared";
import type { PublishConfig, PublishResult, PublisherAdapter, RedirectsConfig, RevalidateResult, StageContext } from "@cc/shared";

export class PublishError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "PublishError";
    this.code = code;
  }
}

export interface SitePublisherOptions {
  publish: PublishConfig;
  redirects: RedirectsConfig;
  /** Value of `publish.revalidate.token_env`, read from the environment by the CLI; never logged. */
  revalidateToken?: string | undefined;
}

export interface SitePublisher extends PublisherAdapter {
  unpublish(slug: string, ctx: StageContext): Promise<void>;
  revalidate(paths: string[], ctx: StageContext): Promise<RevalidateResult>;
  syncRedirects(ctx: StageContext): Promise<number>;
}

export function publicationUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${slug}/`;
}

type Row = Record<string, unknown>;

export function createSitePublisher(options: SitePublisherOptions): SitePublisher {
  const cfg = options.publish;
  return {
    target: "site",

    async publish(item, ctx: StageContext): Promise<PublishResult> {
      const insert = PublicationInsert.parse(item);
      const db = ctx.adapters.db;
      const existing = (await db.select<PublicationRow>("publications", { slug: insert.slug }, { limit: 1 }))[0];
      const url = publicationUrl(cfg.base_url, insert.slug);
      const sameDraft = existing !== undefined && (existing.draft_id ?? null) === (insert.draft_id ?? null);
      if (existing && !sameDraft) {
        const detail = { slug: insert.slug, existing_draft_id: existing.draft_id, existing_publisher: existing.publisher, incoming_draft_id: insert.draft_id ?? null, policy: cfg.slug_conflict };
        if (cfg.slug_conflict === "fail") throw new PublishError("SLUG_CONFLICT", `${insert.slug} is already published by another draft (publish.slug_conflict: fail)`);
        if (cfg.slug_conflict === "skip") {
          ctx.logger.warn("publish: slug already taken by another draft; skipped", detail);
          return { slug: insert.slug, url, action: "skipped", id: existing.id };
        }
        ctx.logger.warn("publish: slug already taken by another draft; updating in place", detail);
      }
      const now = ctx.now.toISOString();
      const row = PublicationRow.parse({
        id: existing?.id ?? publicationId(insert.slug),
        draft_id: insert.draft_id ?? null,
        slug: insert.slug,
        content_type: insert.content_type,
        title: insert.title,
        body: insert.body,
        image: insert.image ?? null,
        sources: insert.sources,
        // The first publication date survives a re-publish; the row's updated_at moves.
        published_at: existing?.published_at ?? insert.published_at,
        updated_at: now,
        publisher: insert.publisher,
        status: insert.status,
        legacy_id: insert.legacy_id ?? existing?.legacy_id ?? null,
        noindex: insert.noindex ?? false,
        tags: insert.tags ?? [],
        category: insert.category ?? null,
        region: insert.region ?? null,
      });
      await db.upsert("publications", [row as Row], ["slug"]);
      const action = existing ? "updated" : "inserted";
      ctx.logger.info("publish: publication written", { slug: row.slug, action, id: row.id, content_type: row.content_type, status: row.status });
      return { slug: row.slug, url, action, id: row.id };
    },

    async unpublish(slug, ctx) {
      const changed = await ctx.adapters.db.update("publications", { slug }, { status: "unpublished", updated_at: ctx.now.toISOString() });
      ctx.logger.info("publish: unpublished", { slug, rows: changed });
    },

    async syncRedirects(ctx) {
      if (!cfg.redirects_sync || options.redirects.length === 0) return 0;
      const rows: Row[] = options.redirects.map((r) => ({ from_path: r.from_path, to_path: r.to_path, status: r.status }));
      const result = await ctx.adapters.db.upsert("redirects", rows, ["from_path"]);
      ctx.logger.info("publish: redirects synced", { rows: result.written });
      return result.written;
    },

    async revalidate(paths, ctx) {
      const result: RevalidateResult = { requested: 0, ok: 0, failed: 0, skipped: false, errors: [] };
      if (!cfg.revalidate.enabled) return { ...result, skipped: true };
      result.requested = paths.length;
      const token = options.revalidateToken;
      if (!token) {
        result.failed = paths.length;
        result.errors.push(`REVALIDATE_TOKEN_MISSING: ${cfg.revalidate.token_env} is not set`);
        ctx.logger.warn("publish: revalidation skipped, bypass token missing", { token_env: cfg.revalidate.token_env, paths: paths.length });
        return result;
      }
      for (const path of paths) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), cfg.revalidate.timeout_ms);
        try {
          const response = await ctx.fetch(`${cfg.base_url.replace(/\/$/, "")}${path}`, { method: "GET", headers: { "x-prerender-revalidate": token }, signal: controller.signal });
          if (response.ok) result.ok += 1;
          else {
            result.failed += 1;
            result.errors.push(`${path}: http ${response.status}`);
          }
        } catch (error) {
          result.failed += 1;
          result.errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
        } finally {
          clearTimeout(timer);
        }
      }
      if (result.failed > 0) ctx.logger.warn("publish: revalidation incomplete; ISR expires on its own", { requested: result.requested, ok: result.ok, failed: result.failed, errors: result.errors.slice(0, 5) });
      else ctx.logger.info("publish: revalidated", { paths: result.ok });
      return result;
    },
  };
}
