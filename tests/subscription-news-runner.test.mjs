import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runSubscriptionNews, runSubscriptionCommand, SUBSCRIPTION_NEWS_STEPS, subscriptionNewsEnvironment } from '../scripts/run-subscription-news.mjs';

async function fixture(t) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'subscription-news-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const common = path.join(cwd, 'common');
  await mkdir(common);
  const calls = [];
  return {
    cwd, common, calls,
    options: {
      cwd, args: [], env: {}, output: () => {}, commonDirectory: () => common,
      readiness: async () => calls.push('ready'),
      runCommand: async (command, args, options) => {
        assert.equal(options.env.LLM_PROVIDER, 'subscription');
        assert.equal(options.env.IMAGE_PROVIDER, 'codex');
        assert.equal(options.env.SUPABASE_SERVICE_ROLE_KEY, '');
        assert.ok((await readdir(common)).includes('subscription-news.lock'));
        calls.push(`${command} ${args.join(' ')}`);
      },
    },
  };
}

test('subscription local runner validates in workflow order without publishing', async (t) => {
  const { common, calls, options } = await fixture(t);
  await runSubscriptionNews(options);
  assert.deepEqual(calls, ['ready', ...SUBSCRIPTION_NEWS_STEPS.map(([cmd, args]) => `${cmd} ${args.join(' ')}`)]);
  assert.equal(calls.some((call) => /git (commit|push)|heartbeat/.test(call)), false);
  assert.deepEqual(await readdir(common), []);
});

test('subscription failure stops remaining steps and releases owned lock', async (t) => {
  const { common, calls, options } = await fixture(t);
  const runCommand = options.runCommand;
  options.runCommand = async (...args) => {
    await runCommand(...args);
    if (args[1].includes('scripts/pipeline.mjs')) throw new Error('subscription login expired');
  };
  await assert.rejects(runSubscriptionNews(options), /subscription login expired/);
  assert.deepEqual(calls, ['ready', 'npm run check', 'node scripts/pipeline.mjs']);
  assert.deepEqual(await readdir(common), []);
});

test('existing writer lock is preserved and prevents readiness and generation', async (t) => {
  const { common, calls, options } = await fixture(t);
  await mkdir(path.join(common, 'subscription-news.lock'));
  await assert.rejects(runSubscriptionNews(options), /Another subscription writer/);
  assert.deepEqual(calls, []);
  assert.deepEqual(await readdir(common), ['subscription-news.lock']);
});

test('dry-run and help do not authenticate, generate or write a lock', async (t) => {
  const { common, calls, options } = await fixture(t);
  for (const flag of ['--help', '--dry-run']) await runSubscriptionNews({ ...options, args: [flag] });
  assert.deepEqual(calls, []);
  assert.deepEqual(await readdir(common), []);
});

test('check performs only authentication readiness without lock writes', async (t) => {
  const { common, calls, options } = await fixture(t);
  await runSubscriptionNews({ ...options, args: ['--check'] });
  assert.deepEqual(calls, ['ready']);
  assert.deepEqual(await readdir(common), []);
});

test('local runner rejects CI and invalid flags before any generation', async (t) => {
  const { calls, options } = await fixture(t);
  await assert.rejects(runSubscriptionNews({ ...options, env: { CI: 'true' } }), /local-only/);
  await assert.rejects(runSubscriptionNews({ ...options, args: ['--push'] }), /Usage:/);
  assert.deepEqual(calls, []);
});

test('local generation environment strips API and archive credentials', () => {
  const env = subscriptionNewsEnvironment({
    PATH: '/bin', HOME: '/home/test', OPENROUTER_API_KEY: 'secret', ANTHROPIC_AUTH_TOKEN: 'secret',
    OPENAI_API_KEY: 'secret', SUPABASE_SERVICE_ROLE_KEY: 'secret', SUPABASE_URL: 'remote',
    ANTHROPIC_BASE_URL: 'https://proxy.invalid', SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED: '1',
  });
  assert.equal(JSON.stringify(env).includes('secret'), false);
  assert.equal(env.ANTHROPIC_BASE_URL, undefined);
  assert.equal(env.HOME, '/home/test');
  assert.equal(env.SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED, '1');
});

test('interrupted generation stops before next command and cleans lock', async (t) => {
  const { common, calls, options } = await fixture(t);
  const controller = new AbortController();
  const runCommand = options.runCommand;
  options.runCommand = async (...args) => {
    await runCommand(...args);
    controller.abort(new Error('test interruption'));
  };
  await assert.rejects(runSubscriptionNews({ ...options, signal: controller.signal }), /test interruption/);
  assert.deepEqual(calls, ['ready', 'npm run check']);
  assert.deepEqual(await readdir(common), []);
});

test('command driver observes actual child exit and cancellation', async () => {
  const controller = new AbortController();
  const options = { cwd: process.cwd(), env: process.env, signal: controller.signal };
  await runSubscriptionCommand('node', ['-e', 'process.exit(0)'], options);
  await assert.rejects(runSubscriptionCommand('node', ['-e', 'process.exit(7)'], options), /exit 7/);
  const pending = runSubscriptionCommand('node', ['-e', 'setInterval(() => {}, 1000)'], options);
  const timer = setTimeout(() => controller.abort(new Error('cancel child')), 50);
  try {
    await assert.rejects(pending, /cancel child/);
  } finally {
    clearTimeout(timer);
  }
});
