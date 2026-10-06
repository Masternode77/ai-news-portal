import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createSubscriptionProvider, runSubscriptionCli, subscriptionEnvironment } from '../scripts/lib/subscription-provider.mjs';

const messages = [{ role: 'user', content: 'Summarize the supplied facts.' }];
const env = { ...process.env, SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED: '1' };
const help = '--ignore-user-config --ephemeral --sandbox --output-last-message --safe-mode --tools --disallowedTools --strict-mcp-config --setting-sources --settings --no-session-persistence';
function fixture({ auth = {}, result, failGeneration } = {}) {
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, ...options });
    if (args.includes('--help')) return { stdout: help, stderr: '' };
    if (args[0] === 'login') return { stdout: '', stderr: auth.codex ?? 'Logged in using ChatGPT' };
    if (args[0] === 'auth') return { stdout: JSON.stringify(auth.claude ?? { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max' }), stderr: '' };
    if (failGeneration) throw new Error('Usage limit reached');
    if (command === 'codex') {
      await writeFile(args[args.indexOf('--output-last-message') + 1], result ?? 'Astra text');
      return { stdout: 'progress is not the answer', stderr: '' };
    }
    return { stdout: JSON.stringify(result ?? { subtype: 'success', is_error: false, result: 'Fable text', modelUsage: { 'claude-fable-5-1': {} } }), stderr: '' };
  };
  return { calls, provider: createSubscriptionProvider({ run, env }) };
}

test('Astra captures final file and runs without tools, API environment, or repository cwd', async () => {
  const { calls, provider } = fixture();
  assert.equal(await provider.subscriptionChatText(messages), 'Astra text');
  const call = calls.at(-1);
  assert.equal(call.args[call.args.indexOf('--model') + 1], 'gpt-6-astra');
  assert.ok(call.args.includes('forced_login_method="chatgpt"'));
  assert.ok(call.args.includes('features.shell_tool=false'));
  assert.ok(call.args.includes('features.apps=false'));
  assert.ok(call.args.includes('approval_policy="never"'));
  assert.ok(call.args.includes('read-only'));
  assert.notEqual(call.cwd, process.cwd());
  assert.match(call.input, /Summarize the supplied facts/);
  await assert.rejects(access(call.cwd));
});

test('column uses Fable with no tools, strict empty MCP and only requested model', async () => {
  const { calls, provider } = fixture();
  assert.equal(await provider.subscriptionChatText(messages, { task: 'column' }), 'Fable text');
  const call = calls.at(-1);
  assert.equal(call.command, 'claude');
  assert.equal(call.args[call.args.indexOf('--model') + 1], 'claude-fable-5-1');
  assert.equal(call.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE, '1');
  assert.equal(call.args[call.args.indexOf('--tools') + 1], '');
  assert.ok(call.args.includes('--safe-mode'));
  assert.ok(call.args.includes('--strict-mcp-config'));
  await assert.rejects(access(call.cwd));
});

test('environment allowlist discards API tokens, endpoints, providers and node injection', () => {
  assert.deepEqual(subscriptionEnvironment({ PATH: '/bin', HOME: '/home/test', USER: 'test', CODEX_HOME: '/home/test/.codex', OPENAI_API_KEY: 'secret', ANTHROPIC_AUTH_TOKEN: 'secret', OPENROUTER_API_KEY: 'secret', ANTHROPIC_BASE_URL: 'proxy', CLAUDE_CODE_USE_BEDROCK: '1', NODE_OPTIONS: '--require=evil', AWS_PROFILE: 'paid' }), { PATH: '/bin', HOME: '/home/test', USER: 'test', CODEX_HOME: '/home/test/.codex' });
});

test('preflight requires explicit operator billing confirmation', async () => {
  const provider = createSubscriptionProvider({ env: {}, run: () => { throw new Error('must not spawn'); } });
  await assert.rejects(provider.assertSubscriptionReady(), /operator confirmation/);
});

test('preflight rejects API credentials and non-Max Claude subscriptions', async () => {
  const codex = fixture({ auth: { codex: 'Logged in using an API key' } });
  await assert.rejects(codex.provider.subscriptionChatText(messages), /API authentication is not accepted/);
  for (const authMethod of ['api_key', 'oauth_token', 'third_party', 'none']) {
    const { provider } = fixture({ auth: { claude: { loggedIn: true, authMethod, apiProvider: 'firstParty', subscriptionType: 'max' } } });
    await assert.rejects(provider.subscriptionChatText(messages, { task: 'column' }), /Max subscription login/);
  }
  const pro = fixture({ auth: { claude: { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'pro' } } });
  await assert.rejects(pro.provider.assertSubscriptionReady(), /Max subscription login/);
});

test('old CLIs fail closed before auth or generation', async () => {
  const provider = createSubscriptionProvider({ env, run: async () => ({ stdout: '--model', stderr: '' }) });
  await assert.rejects(provider.assertSubscriptionReady(), /too old/);
});

test('Claude rejects fallback model, empty result and error results', async () => {
  for (const result of [
    { subtype: 'success', result: 'text', modelUsage: { 'claude-sonnet-4-5': {} } },
    { subtype: 'success', result: 'text', modelUsage: {} },
    { subtype: 'success', result: '' },
    { subtype: 'error_max_turns', is_error: true, result: 'unfinished' },
  ]) {
    await assert.rejects(fixture({ result }).provider.subscriptionChatText(messages, { task: 'column' }));
  }
});

test('generation failure does not retry or call an API and removes temp directory', async () => {
  const { calls, provider } = fixture({ failGeneration: true });
  await assert.rejects(provider.subscriptionChatText(messages), /Usage limit/);
  assert.equal(calls.length, 3);
  await assert.rejects(access(calls.at(-1).cwd));
});

test('real subprocess handles stdin and kills a timed-out process', async () => {
  const options = { cwd: process.cwd(), env: subscriptionEnvironment(), input: 'hello', timeoutMs: 5000 };
  const result = await runSubscriptionCli(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], options);
  assert.equal(result.stdout, 'hello');
  await assert.rejects(runSubscriptionCli(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { ...options, timeoutMs: 100 }), /timed out/);
  const controller = new AbortController();
  const originalSigtermListeners = process.listenerCount('SIGTERM');
  const originalSigintListeners = process.listenerCount('SIGINT');
  const execution = runSubscriptionCli(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { ...options, signal: controller.signal });
  assert.equal(process.listenerCount('SIGTERM'), originalSigtermListeners);
  assert.equal(process.listenerCount('SIGINT'), originalSigintListeners);
  controller.abort();
  await assert.rejects(execution, /cancelled/);
  assert.equal(process.exitCode, undefined, 'caller retains lifecycle ownership after cancellation');
});

test('pipeline termination kills its detached CLI before exit and does not resume generation', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'subscription-interrupt-test-'));
  const pidPath = join(directory, 'cli.pid');
  const cleanupPath = join(directory, 'cleaned');
  const resumedPath = join(directory, 'resumed');
  const providerUrl = new URL('../scripts/lib/subscription-provider.mjs', import.meta.url).href;
  const cliCode = `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000);`;
  const pipelineCode = `
    import { runSubscriptionCli, subscriptionEnvironment } from ${JSON.stringify(providerUrl)};
    import { writeFile } from 'node:fs/promises';
    process.on('message', () => process.emit('SIGTERM'));
    try {
      await runSubscriptionCli(process.execPath, ['-e', ${JSON.stringify(cliCode)}], {
        cwd: ${JSON.stringify(directory)}, env: subscriptionEnvironment(), timeoutMs: 12000,
        onTerminate: () => writeFile(${JSON.stringify(cleanupPath)}, 'cleaned')
      });
    } catch {}
    await writeFile(${JSON.stringify(resumedPath)}, 'must not continue');
    process.exit(0);
  `;
  const pipeline = spawn(process.execPath, ['--input-type=module', '-e', pipelineCode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
  const exited = once(pipeline, 'exit');
  let cliPid;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { cliPid = Number(await readFile(pidPath, 'utf8')); break; } catch { await delay(50); }
    }
    assert.ok(cliPid, 'nested CLI started');
    if (process.platform === 'win32') pipeline.send('terminate');
    else pipeline.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, 143);
    assert.equal(await readFile(cleanupPath, 'utf8'), 'cleaned');
    await assert.rejects(access(resumedPath));
    assert.throws(() => process.kill(cliPid, 0), { code: 'ESRCH' });
  } finally {
    pipeline.kill('SIGKILL');
    if (cliPid) { try { process.kill(cliPid, 'SIGKILL'); } catch {} }
    await rm(directory, { recursive: true, force: true });
  }
});
