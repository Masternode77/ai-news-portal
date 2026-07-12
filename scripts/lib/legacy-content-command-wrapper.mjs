import { runCanonicalContentCommand } from '../../src/adapters/content-cycle-composition.mjs';

export async function runLegacyContentCommand(alias, command) {
  const receipt = await runCanonicalContentCommand(command, {
    production: command === 'cycle',
  });
  console.log(JSON.stringify({ alias, canonicalCommand: `content:${command}`, ...receipt }));
  return receipt;
}
