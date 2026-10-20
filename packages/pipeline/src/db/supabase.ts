/**
 * Supabase-backed DbPort, typed against the same minimal client shape as the
 * ledger. PostgREST does not report an inserted/updated split or an affected
 * row count without a representation, so those come back as null (see the
 * DbPort contract) and callers that need them select first.
 */
import type { DbPort, Row, SelectOptions, TableName, UpsertResult } from "@cc/shared";
import type { SupabaseLike, SupabaseQuery, SupabaseResult, SupabaseSelectResult, SupabaseWindow } from "../ledger/supabase.ts";

export const DEFAULT_SELECT_LIMIT = 1000;

function check(result: SupabaseResult, operation: string): void {
  if (result.error) throw new Error(`SupabaseDb.${operation}: ${result.error.message}`);
}

/**
 * PostgREST builds the column list from the union of keys across the rows and
 * writes NULL (or the default) for a key a row lacks, so a mixed batch silently
 * overwrites columns on conflict. Refuse it here instead.
 */
export function assertUniformColumns(rows: readonly Row[], operation: string): void {
  const first = rows[0];
  if (!first) return;
  const expected = Object.keys(first).sort().join(",");
  for (const [index, row] of rows.entries()) {
    const keys = Object.keys(row).sort().join(",");
    if (keys !== expected) throw new Error(`SupabaseDb.${operation}: row ${index} has columns [${keys}] but row 0 has [${expected}]; every row in a batch must carry the same columns`);
  }
}

/**
 * Applies `orderBy` (when the client supports `.order`) and the row window to a
 * filtered select: `limit` alone, or PostgREST's inclusive `range(offset, offset + limit - 1)`
 * when the caller pages with `offset`. PostgREST also caps one response at the
 * project's `max-rows` (1000 by default), so a caller that needs more rows pages.
 */
function limited(query: SupabaseQuery, options: SelectOptions, operation: string): PromiseLike<SupabaseSelectResult> {
  const limit = options.limit ?? DEFAULT_SELECT_LIMIT;
  let tail: SupabaseWindow = query;
  if (options.orderBy) {
    if (typeof query.order !== "function") throw new Error(`SupabaseDb.${operation}: the client does not support order()`);
    tail = query.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
  }
  if (options.offset === undefined) return tail.limit(limit);
  if (typeof tail.range !== "function") throw new Error(`SupabaseDb.${operation}: the client does not support range()`);
  return tail.range(options.offset, options.offset + limit - 1);
}

export class SupabaseDb implements DbPort {
  readonly kind = "supabase" as const;
  private readonly client: SupabaseLike;

  constructor(client: SupabaseLike) {
    this.client = client;
  }

  async insert<T extends Row>(table: TableName, rows: T[]): Promise<T[]> {
    if (rows.length === 0) return [];
    assertUniformColumns(rows, `insert(${table})`);
    check(await this.client.from(table).insert(rows), `insert(${table})`);
    return rows;
  }

  async upsert<T extends Row>(table: TableName, rows: T[], conflictKeys: readonly string[]): Promise<UpsertResult> {
    if (rows.length === 0) return { written: 0, inserted: 0, updated: 0 };
    if (conflictKeys.length === 0) throw new Error("SupabaseDb.upsert: conflictKeys must not be empty");
    assertUniformColumns(rows, `upsert(${table})`);
    check(await this.client.from(table).upsert(rows, { onConflict: conflictKeys.join(",") }), `upsert(${table})`);
    return { written: rows.length, inserted: null, updated: null };
  }

  async select<T extends Row>(table: TableName, where: Partial<Row> = {}, options: SelectOptions = {}): Promise<T[]> {
    const columns = options.columns?.length ? options.columns.join(",") : "*";
    const query = this.client.from(table).select(columns).match(where);
    const result = await limited(query, options, `select(${table})`);
    check(result, `select(${table})`);
    return (result.data ?? []) as T[];
  }

  async selectIn<T extends Row>(table: TableName, column: string, values: readonly unknown[], options: SelectOptions = {}): Promise<T[]> {
    if (values.length === 0) return [];
    const columns = options.columns?.length ? options.columns.join(",") : "*";
    const query = this.client.from(table).select(columns).in(column, [...values]);
    const result = await limited(query, options, `selectIn(${table})`);
    check(result, `selectIn(${table})`);
    return (result.data ?? []) as T[];
  }

  async update(table: TableName, where: Partial<Row>, patch: Row): Promise<number | null> {
    check(await this.client.from(table).update(patch).match(where), `update(${table})`);
    return null;
  }
}
