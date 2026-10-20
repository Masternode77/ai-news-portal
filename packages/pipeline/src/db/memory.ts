/** In-memory DbPort for dry-run and tests. Idempotent upserts keyed by the given conflict columns. */
import type { DbPort, Row, SelectOptions, TableName, UpsertResult } from "@cc/shared";

function matches(row: Row, where: Partial<Row> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Sorts like PostgREST's default: nulls last in either direction. */
function ordered(rows: Row[], options: SelectOptions): Row[] {
  const { orderBy } = options;
  if (!orderBy) return rows;
  const direction = orderBy.ascending === false ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = a[orderBy.column];
    const right = b[orderBy.column];
    const leftNull = left === null || left === undefined;
    const rightNull = right === null || right === undefined;
    if (leftNull || rightNull) return leftNull === rightNull ? 0 : leftNull ? 1 : -1;
    return compareValues(left, right) * direction;
  });
}

/** `offset` rows skipped, then at most `limit` rows (both optional), after ordering. */
function window(rows: Row[], options: SelectOptions): Row[] {
  const start = options.offset ?? 0;
  return options.limit === undefined ? rows.slice(start) : rows.slice(start, start + options.limit);
}

export class MemoryDb implements DbPort {
  readonly kind = "memory" as const;
  private readonly tables = new Map<TableName, Row[]>();

  private table(name: TableName): Row[] {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = [];
      this.tables.set(name, rows);
    }
    return rows;
  }

  async insert<T extends Row>(table: TableName, rows: T[]): Promise<T[]> {
    const copies = rows.map((row) => structuredClone(row));
    this.table(table).push(...copies);
    return copies;
  }

  async upsert<T extends Row>(table: TableName, rows: T[], conflictKeys: readonly string[]): Promise<UpsertResult> {
    if (conflictKeys.length === 0) throw new Error("MemoryDb.upsert: conflictKeys must not be empty");
    const existing = this.table(table);
    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
      const key = Object.fromEntries(conflictKeys.map((k) => [k, row[k]]));
      const index = existing.findIndex((candidate) => matches(candidate, key));
      if (index === -1) {
        existing.push(structuredClone(row));
        inserted += 1;
      } else {
        existing[index] = { ...existing[index], ...structuredClone(row) };
        updated += 1;
      }
    }
    return { written: rows.length, inserted, updated };
  }

  async select<T extends Row>(table: TableName, where?: Partial<Row>, options: SelectOptions = {}): Promise<T[]> {
    const rows = ordered(this.table(table).filter((row) => matches(row, where)), options);
    const limited = window(rows, options);
    const projected = options.columns ? limited.map((row) => Object.fromEntries(options.columns!.map((c) => [c, row[c]]))) : limited;
    return structuredClone(projected) as T[];
  }

  async selectIn<T extends Row>(table: TableName, column: string, values: readonly unknown[], options: SelectOptions = {}): Promise<T[]> {
    const wanted = new Set(values);
    const rows = ordered(this.table(table).filter((row) => wanted.has(row[column])), options);
    const limited = window(rows, options);
    const projected = options.columns ? limited.map((row) => Object.fromEntries(options.columns!.map((c) => [c, row[c]]))) : limited;
    return structuredClone(projected) as T[];
  }

  async update(table: TableName, where: Partial<Row>, patch: Row): Promise<number> {
    let count = 0;
    const rows = this.table(table);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row && matches(row, where)) {
        rows[i] = { ...row, ...structuredClone(patch) };
        count += 1;
      }
    }
    return count;
  }

  /** Test helper: row count per table. */
  size(table: TableName): number {
    return this.table(table).length;
  }

  /** Test and dry-run helper: a copy of every row in a table. */
  rows<T extends Row>(table: TableName): T[] {
    return structuredClone(this.table(table)) as T[];
  }
}
