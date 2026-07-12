import { runCanonicalContentCommand } from '../../src/adapters/content-cycle-composition.mjs';

function migrationReceipt(alias, command) {
  return {
    alias,
    canonicalCommand: `content:${command}`,
    message: `Legacy command ${alias} is retired; use npm run content:${command}.`,
  };
}

export async function runLegacyContentCommand(alias, command, {
  args = process.argv.slice(2),
  run = runCanonicalContentCommand,
  log = console.log,
} = {}) {
  const migration = migrationReceipt(alias, command);
  if (args.length > 0) {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      log(JSON.stringify({ ...migration, executed: false }));
      return { ...migration, executed: false };
    }
    throw Object.assign(
      new Error(`${migration.message} Unsupported legacy arguments: ${args.join(' ')}`),
      { code: 'unsupported_legacy_arguments' },
    );
  }
  const receipt = await run(command, {
    production: command === 'cycle',
  });
  log(JSON.stringify({ ...migration, ...receipt }));
  return receipt;
}
