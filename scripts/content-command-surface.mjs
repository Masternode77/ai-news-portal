#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_CYCLE_PHASES } from '../src/core/orchestrator/index.mjs';
import { runCanonicalContentCommand } from '../src/adapters/content-cycle-composition.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_PHASES = CONTENT_CYCLE_PHASES;
const COMMANDS = Object.freeze([...CONTENT_PHASES, 'cycle', 'eval']);
function usage() {
  return [
    'Usage: node scripts/content-command-surface.mjs <command> [--production]',
    '',
    `Commands: ${COMMANDS.join(', ')}`,
  ].join('\n');
}

function parseArgs(argv = process.argv.slice(2)) {
  const [command = '', ...rest] = argv;
  return {
    command,
    production: rest.includes('--production'),
    rest,
    help: command === '--help' || command === '-h' || rest.includes('--help') || rest.includes('-h'),
  };
}

function spawnNode(relativeScript, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, relativeScript), ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`${relativeScript} terminated by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function assertKnownPhase(command) {
  if (!CONTENT_PHASES.includes(command)) return;
  if (!CONTENT_CYCLE_PHASES.includes(command)) {
    throw new Error(`content phase ${command} is missing from src/core/orchestrator`);
  }
}

async function runCommand(command, options = {}) {
  if (!COMMANDS.includes(command)) {
    throw new Error(`unknown content command: ${command || '(empty)'}`);
  }

  assertKnownPhase(command);

  if (command === 'cycle') {
    if (!options.production || options.rest.length !== 1 || options.rest[0] !== '--production') {
      throw new Error('content:cycle requires exactly one argument: --production');
    }
    const receipt = await runCanonicalContentCommand('cycle', { production: true });
    console.log(JSON.stringify(receipt));
    return 0;
  }

  if (command === 'eval') {
    if (options.rest.length) throw new Error('content:eval does not accept additional arguments');
    return spawnNode('scripts/eval-article-generation.mjs');
  }

  if (options.rest.length) throw new Error(`content:${command} does not accept additional arguments`);
  const receipt = await runCanonicalContentCommand(command);
  console.log(JSON.stringify(receipt));
  return 0;
}

const args = parseArgs();

if (args.help) {
  console.log(usage());
  process.exit(0);
}

try {
  const code = await runCommand(args.command, args);
  process.exit(code);
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(1);
}
