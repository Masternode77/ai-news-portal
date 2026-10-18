/** Supabase-backed DbPort, typed against the same minimal client shape as the ledger. */
import type { DbPort, Row, TableName, UpsertResult } from "@cc/shared";
import type { SupabaseLike, SupabaseResult } from "../ledger/supabase.ts";

function check(result: SupabaseResult, operation: string): void {
  if (result.error) throw new Error(`SupabaseDb.${operation}: ${result.error.message}`);
}

export class SupabaseDb implements DbPort {
  readonly kind = "supabase" as const;
  private readonly client: SupabaseLike;

  constructor(client: SupabaseLike) {
    this.client = client;
  }

  async insert<T extends Row>(table: TableName, rows: T[]): Promise<T[]> {
    if (rows.length === 0) return [];
    check(await this.client.from(table).insert(rows), `insert(${table})`);
    return rows;
  }

  async upsert<T extends Row>(table: TableName, rows: T[], conflictKeys: readonly string[]): Promise<UpsertResult> {
    if (rows.length === 0) return { inserted: 0, updated: 0 };
    check(await this.client.from(table).upsert(rows, { onConflict: conflictKeys.join(",") }), `upsert(${table})`);
    // PostgREST does not report inserted-vs-updated; callers that need the split select first.
    return { inserted: rows.length, updated: 0 };
  }

  async select<T extends Row>(table: TableName, where: Partial<Row> = {}, options: { limit?: number } = {}): Promise<T[]> {
    const result = await this.client.from(table).select("*").match(where).limit(options.limit ?? 1000);
    check(result, `select(${table})`);
    return (result.data ?? []) as T[];
  }

  async update(table: TableName, where: Partial<Row>, patch: Row): Promise<number> {
    check(await this.client.from(table).update(patch).match(where), `update(${table})`);
    return -1; // PostgREST returns affected rows only with a representation; Phase 3 refines.
  }
}
