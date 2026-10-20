/**
 * Seeds the memory DbPort from `fixtures/db/<name>.json` for fixture runs
 * (R7): a JSON object keyed by table name with full rows, validated with the
 * table's row schema. Phase 3b uses it for `publications`, so a replay can
 * show DUPLICATE_OF_PUBLISHED without a database.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PublicationRow } from "@cc/shared";
import type { DbPort, Row } from "@cc/shared";

export interface SeedSummary {
  path: string;
  publications: number;
}

export async function seedMemoryDb(db: DbPort, fixturesDir: string, fixtureName: string): Promise<SeedSummary | null> {
  const path = join(fixturesDir, "db", `${fixtureName}.json`);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const publications = Array.isArray(parsed["publications"]) ? (parsed["publications"] as unknown[]) : [];
  const rows = publications.map((row, index) => {
    const result = PublicationRow.safeParse(row);
    if (!result.success) throw new Error(`FIXTURE_INVALID: ${path} publications[${index}]: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    return result.data as Row;
  });
  if (rows.length > 0) await db.insert("publications", rows);
  return { path, publications: rows.length };
}
