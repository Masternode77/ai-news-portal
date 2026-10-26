/**
 * Telegram notifier (Phase 3i, ADR-007): one Bot API `sendMessage` per run,
 * plain text, through the injected fetch only (throws in --replay). The bot
 * token is used in the request URL and nowhere else: it never reaches the
 * log, the result or an error message (scrubbed). Delivery failures are
 * soft — counted, logged, returned — never thrown.
 */
import type { Notifier, NotifyContext, NotifyMessage, NotifyResult, TelegramNotifyConfig } from "@cc/shared";

export const TELEGRAM_TOKEN_MISSING = "TELEGRAM_TOKEN_MISSING";
export const TELEGRAM_CHAT_ID_MISSING = "TELEGRAM_CHAT_ID_MISSING";
export const TELEGRAM_TIMEOUT = "TELEGRAM_TIMEOUT";
export const TELEGRAM_NETWORK = "TELEGRAM_NETWORK";
/** The Bot API's own limit for sendMessage text. */
export const TELEGRAM_MAX_CHARS = 4096;

export interface TelegramNotifierOptions {
  config: TelegramNotifyConfig;
  /** Read by the CLI from the environment names in the config; never logged. */
  botToken: string | undefined;
  chatId: string | undefined;
  /** Injected by tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

const CUT_MARKER = "\n…[cut]";

/** Cuts a message to the Bot API limit, keeping the head (status, funnel) over the tail. */
export function clampMessage(text: string, maxChars: number): string {
  const limit = Math.min(maxChars, TELEGRAM_MAX_CHARS);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - CUT_MARKER.length))}${CUT_MARKER}`;
}

/** Telegram's error body: `{ ok: false, error_code, description, parameters?: { retry_after } }`. */
async function describeError(response: Response): Promise<{ detail: string; retryAfterMs: number | null }> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    text = "";
  }
  try {
    const parsed = JSON.parse(text) as { description?: unknown; parameters?: { retry_after?: unknown } };
    const retryAfter = parsed.parameters?.retry_after;
    return {
      detail: typeof parsed.description === "string" ? parsed.description : response.statusText || "no description",
      retryAfterMs: typeof retryAfter === "number" && retryAfter > 0 ? retryAfter * 1000 : null,
    };
  } catch {
    return { detail: text.trim() || response.statusText || "no description", retryAfterMs: null };
  }
}

export function createTelegramNotifier(options: TelegramNotifierOptions): Notifier {
  const cfg = options.config;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const token = options.botToken;
  const scrub = (text: string): string => (token ? text.split(token).join("[redacted]") : text);
  const clip = (text: string): string => scrub(text).replace(/\s+/g, " ").slice(0, 200);

  return {
    channel: "telegram",
    async send(message: NotifyMessage, ctx: NotifyContext): Promise<NotifyResult> {
      const startedAt = Date.now();
      const done = (partial: Omit<NotifyResult, "channel" | "ms">): NotifyResult => ({ channel: "telegram", ...partial, ms: Date.now() - startedAt });
      if (!cfg.enabled) return done({ sent: false, skipped: "disabled", attempts: 0, error: null });
      if (!cfg.on.includes(message.status)) return done({ sent: false, skipped: "status_filtered", attempts: 0, error: null });
      if (!token) return done({ sent: false, skipped: null, attempts: 0, error: `${TELEGRAM_TOKEN_MISSING}: ${cfg.bot_token_env} is not set` });
      if (!options.chatId) return done({ sent: false, skipped: null, attempts: 0, error: `${TELEGRAM_CHAT_ID_MISSING}: ${cfg.chat_id_env} is not set` });

      const text = clampMessage(message.text, cfg.max_chars);
      const url = `${cfg.base_url.replace(/\/$/, "")}/bot${token}/sendMessage`;
      const body = JSON.stringify({ chat_id: options.chatId, text, disable_web_page_preview: true });
      let attempts = 0;
      let lastError = "";
      while (attempts <= cfg.max_retries) {
        attempts += 1;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), cfg.timeout_ms);
        let waitMs = cfg.retry_backoff_ms * attempts;
        let retryable = true;
        try {
          const response = await ctx.fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal });
          if (response.ok) {
            ctx.logger.info("notify: telegram sent", { kind: message.kind, status: message.status, chars: text.length, attempts, chat_id_env: cfg.chat_id_env });
            return done({ sent: true, skipped: null, attempts, error: null });
          }
          const { detail, retryAfterMs } = await describeError(response);
          lastError = `TELEGRAM_HTTP_${response.status}: ${clip(detail)}`;
          retryable = response.status === 429 || response.status >= 500;
          if (retryAfterMs !== null) waitMs = Math.min(retryAfterMs, cfg.timeout_ms);
        } catch (error) {
          const raw = error instanceof Error ? error.message : String(error);
          if (controller.signal.aborted) lastError = `${TELEGRAM_TIMEOUT}: no response within ${cfg.timeout_ms} ms`;
          else if (/^[A-Z][A-Z0-9_]{2,}:/.test(raw)) lastError = clip(raw);
          else lastError = `${TELEGRAM_NETWORK}: ${clip(raw)}`;
          // A disabled fetch (--replay) is deterministic; retrying it only burns time.
          retryable = !raw.startsWith("NETWORK_DISABLED");
        } finally {
          clearTimeout(timer);
        }
        if (!retryable || attempts > cfg.max_retries) break;
        if (waitMs > 0) await sleep(waitMs);
      }
      ctx.logger.warn("notify: telegram delivery failed (soft; the run result stands)", { kind: message.kind, status: message.status, attempts, error: lastError });
      return done({ sent: false, skipped: null, attempts, error: lastError });
    },
  };
}
