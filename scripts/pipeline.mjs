#!/usr/bin/env node
import { runCanonicalContentCommand } from '../src/adapters/content-cycle-composition.mjs';

try {
  const receipt = await runCanonicalContentCommand('cycle', { production: true });
  console.log(JSON.stringify(receipt));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
