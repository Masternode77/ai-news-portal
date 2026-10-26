import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger, parsePipelineConfig } from "@cc/shared";
import type { NotifyContext, NotifyMessage, TelegramNotifyConfig } from "@cc/shared";
import { TELEGRAM_CHAT_ID_MISSING, TELEGRAM_TIMEOUT, TELEGRAM_TOKEN_MISSING, clampMessage, createTelegramNotifier } from "../src/notify/index.ts";
import { disabledFetch } from "../src/runner.ts";
import { TEST_PIPELINE_YAML } from "./helpers.ts";

const TOKEN = "123456:ABC-secret-bot-token";
const CHAT = "-1001234567890";
const MSG: NotifyMessage = { kind: "run_summary", runId: "0123456789abcdef", status: "done", text: "[CC pipeline] 2026-10-18 00:45 KST · run 01234567 · done\nfetched 1" };
const noSleep = async (): Promise<void> => undefined;

function cfg(over: Partial<TelegramNotifyConfig> = {}): TelegramNotifyConfig {
  const yaml = TEST_PIPELINE_YAML.replace("notify: { telegram: { enabled: false } }", "notify: { telegram: { enabled: true, retry_backoff_ms: 0 } }");
  return { ...parsePipelineConfig(yaml, { env: {} }).config.notify.telegram, ...over };
}

function ctx(fetchImpl: typeof globalThis.fetch, lines: string[] = []): NotifyContext {
  return { fetch: fetchImpl, logger: createLogger({ name: "test", sink: (line) => lines.push(line) }) };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("sends one plain-text sendMessage through the injected fetch; the token is in the URL path only and never in the log", async () => {
  const calls: { url: string; method: string | undefined; contentType: string | null; body: Record<string, unknown> }[] = [];
  const lines: string[] = [];
  const notifier = createTelegramNotifier({ config: cfg(), botToken: TOKEN, chatId: CHAT, sleep: noSleep });
  const result = await notifier.send(MSG, ctx(async (url, init) => {
    calls.push({ url: String(url), method: init?.method, contentType: new Headers(init?.headers).get("content-type"), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return json({ ok: true, result: { message_id: 1 } });
  }, lines));
  assert.deepEqual({ channel: result.channel, sent: result.sent, skipped: result.skipped, attempts: result.attempts, error: result.error }, { channel: "telegram", sent: true, skipped: null, attempts: 1, error: null });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.contentType, "application/json");
  assert.deepEqual(calls[0]!.body, { chat_id: CHAT, text: MSG.text, disable_web_page_preview: true });
  assert.ok(!("parse_mode" in calls[0]!.body), "plain text: no parse mode to escape for");
  assert.ok(lines.some((l) => l.includes("telegram sent")));
  assert.ok(lines.every((l) => !l.includes(TOKEN)), "the token never reaches the log");
});

test("disabled → skipped; a status outside `on` → status_filtered; neither touches the network", async () => {
  const never: typeof globalThis.fetch = async () => { throw new Error("must not be called"); };
  const off = await createTelegramNotifier({ config: cfg({ enabled: false }), botToken: TOKEN, chatId: CHAT }).send(MSG, ctx(never));
  assert.deepEqual([off.sent, off.skipped, off.attempts, off.error], [false, "disabled", 0, null]);
  const filtered = await createTelegramNotifier({ config: cfg({ on: ["failed", "budget_stop"] }), botToken: TOKEN, chatId: CHAT }).send(MSG, ctx(never));
  assert.deepEqual([filtered.sent, filtered.skipped, filtered.attempts], [false, "status_filtered", 0]);
  const failure = await createTelegramNotifier({ config: cfg({ on: ["failed"] }), botToken: TOKEN, chatId: CHAT }).send({ ...MSG, kind: "run_failure", status: "failed" }, ctx(async () => json({ ok: true })));
  assert.equal(failure.sent, true);
});

test("a missing token or chat id is a name-only error without a request", async () => {
  const never: typeof globalThis.fetch = async () => { throw new Error("must not be called"); };
  const noToken = await createTelegramNotifier({ config: cfg(), botToken: undefined, chatId: CHAT }).send(MSG, ctx(never));
  assert.deepEqual([noToken.sent, noToken.skipped, noToken.attempts, noToken.error], [false, null, 0, `${TELEGRAM_TOKEN_MISSING}: TELEGRAM_BOT_TOKEN is not set`]);
  const noChat = await createTelegramNotifier({ config: cfg(), botToken: TOKEN, chatId: undefined }).send(MSG, ctx(never));
  assert.equal(noChat.error, `${TELEGRAM_CHAT_ID_MISSING}: TELEGRAM_CHAT_ID is not set`);
});

test("5xx retries once (max_retries 1) and then succeeds; 429 waits for retry_after; a 400 is reported with Telegram's description and not retried", async () => {
  let n = 0;
  const flaky = await createTelegramNotifier({ config: cfg(), botToken: TOKEN, chatId: CHAT, sleep: noSleep }).send(MSG, ctx(async () => (n++ === 0 ? json({ ok: false, error_code: 502, description: "Bad Gateway" }, 502) : json({ ok: true }))));
  assert.deepEqual([flaky.sent, flaky.attempts, flaky.error], [true, 2, null]);

  const exhausted = await createTelegramNotifier({ config: cfg({ max_retries: 0 }), botToken: TOKEN, chatId: CHAT, sleep: noSleep }).send(MSG, ctx(async () => json({ ok: false, error_code: 500, description: "Internal Server Error" }, 500)));
  assert.deepEqual([exhausted.sent, exhausted.attempts, exhausted.error], [false, 1, "TELEGRAM_HTTP_500: Internal Server Error"]);

  const waits: number[] = [];
  let m = 0;
  const limited = await createTelegramNotifier({ config: cfg(), botToken: TOKEN, chatId: CHAT, sleep: async (ms) => { waits.push(ms); } }).send(MSG, ctx(async () => (m++ === 0 ? json({ ok: false, error_code: 429, description: "Too Many Requests: retry after 2", parameters: { retry_after: 2 } }, 429) : json({ ok: true }))));
  assert.deepEqual([limited.sent, limited.attempts, waits], [true, 2, [2000]]);

  const bad = await createTelegramNotifier({ config: cfg(), botToken: TOKEN, chatId: CHAT, sleep: noSleep }).send(MSG, ctx(async () => json({ ok: false, error_code: 400, description: "Bad Request: chat not found" }, 400)));
  assert.deepEqual([bad.sent, bad.attempts, bad.error], [false, 1, "TELEGRAM_HTTP_400: Bad Request: chat not found"]);
});

test("a thrown fetch error is scrubbed of the token; the --replay disabled fetch is NETWORK_DISABLED with no retry; a timeout is TELEGRAM_TIMEOUT", async () => {
  const lines: string[] = [];
  const network = await createTelegramNotifier({ config: cfg(), botToken: TOKEN, chatId: CHAT, sleep: noSleep }).send(MSG, ctx(async (url) => { throw new Error(`connect ECONNREFUSED for ${String(url)}`); }, lines));
  assert.equal(network.sent, false);
  assert.equal(network.attempts, 2, "network errors are retried");
  assert.match(network.error!, /^TELEGRAM_NETWORK: connect ECONNREFUSED for https:\/\/api\.telegram\.org\/bot\[redacted\]\/sendMessage$/);
  assert.ok(lines.every((l) => !l.includes(TOKEN)) && !JSON.stringify(network).includes(TOKEN), "scrubbed everywhere");

  const replay = await createTelegramNotifier({ config: cfg(), botToken: TOKEN, chatId: CHAT, sleep: async () => { throw new Error("must not sleep"); } }).send(MSG, ctx(disabledFetch as typeof globalThis.fetch));
  assert.deepEqual([replay.sent, replay.attempts], [false, 1]);
  assert.match(replay.error!, /^NETWORK_DISABLED: replay mode forbids network access$/);

  const slow: typeof globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  const timeout = await createTelegramNotifier({ config: cfg({ timeout_ms: 20, max_retries: 0 }), botToken: TOKEN, chatId: CHAT, sleep: noSleep }).send(MSG, ctx(slow));
  assert.deepEqual([timeout.sent, timeout.attempts, timeout.error], [false, 1, `${TELEGRAM_TIMEOUT}: no response within 20 ms`]);
});

test("clampMessage keeps the head and marks the cut; max_chars caps what is sent", async () => {
  assert.equal(clampMessage("short", 200), "short");
  const long = `${"a".repeat(300)}\n${"b".repeat(300)}`;
  const cut = clampMessage(long, 200);
  assert.equal(cut.length, 200);
  assert.ok(cut.startsWith("aaaa") && cut.endsWith("\n…[cut]"));
  assert.equal(clampMessage("x".repeat(5000), 4096).length, 4096, "never above the Bot API limit");
  let sentText = "";
  await createTelegramNotifier({ config: cfg({ max_chars: 200 }), botToken: TOKEN, chatId: CHAT }).send({ ...MSG, text: long }, ctx(async (_url, init) => { sentText = (JSON.parse(String(init?.body)) as { text: string }).text; return json({ ok: true }); }));
  assert.equal(sentText.length, 200);
});
