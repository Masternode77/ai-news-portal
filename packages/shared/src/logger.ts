/**
 * Structured JSON-lines logger. Secrets never reach the log: any field whose
 * key looks like a credential is replaced by "[redacted]" at every depth, and
 * long strings are truncated so source bodies cannot leak into CI logs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Matches credential-looking keys as whole words at the end of the key
 * (`api_key`, `x-api-key`, `SUPABASE_SERVICE_ROLE_KEY`, `access_token`, `token`,
 * `client_secret`, `password`, `Authorization`, `cookie`, `credentials`) while
 * leaving usage counters such as `inputTokens` / `output_tokens` readable.
 */
export const SENSITIVE_KEY_PATTERN = /(^|[-_])(api[-_]?key|key|secret|token|password\w*|passwd|authorization|cookie|credentials?)$/i;
export const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 8;

export type LogFields = Record<string, unknown>;

export interface Logger {
  readonly level: LogLevel;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  name: string;
  level?: LogLevel;
  /** Receives one serialized JSON line (no trailing newline). Defaults to stdout. */
  sink?: (line: string) => void;
  clock?: () => Date;
  fields?: LogFields;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[depth]";
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated ${value.length - MAX_STRING_LENGTH}]` : value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1), stack: value.stack ? redact(value.stack, depth + 1) : undefined };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && value in LEVEL_RANK;
}

export function createLogger(options: LoggerOptions): Logger {
  const level: LogLevel = options.level ?? "info";
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const clock = options.clock ?? (() => new Date());
  const baseFields = options.fields ?? {};

  const emit = (entryLevel: LogLevel, message: string, fields?: LogFields): void => {
    if (LEVEL_RANK[entryLevel] < LEVEL_RANK[level]) return;
    const entry = {
      ts: clock().toISOString(),
      level: entryLevel,
      name: options.name,
      msg: message,
      ...(redact({ ...baseFields, ...(fields ?? {}) }) as LogFields),
    };
    sink(JSON.stringify(entry));
  };

  return {
    level,
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (fields) => createLogger({ ...options, fields: { ...baseFields, ...fields } }),
  };
}

export function silentLogger(): Logger {
  return createLogger({ name: "silent", level: "error", sink: () => undefined });
}
