import path from 'node:path';
import { parseArgs } from 'node:util';
import { auditRenderedPublicOutput } from './lib/rendered-output-audit.mjs';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
  },
});
const result = await auditRenderedPublicOutput({
  reportPath: values.out ? path.resolve(values.out) : undefined,
});

if (!result.ok) {
  console.error(`rendered public output audit failed:\n${result.failures.slice(0, 80).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`rendered public output audit passed: pages=${result.counts.pages}, articles=${result.counts.articlePages}, cards=${result.counts.cards}, brokenImages=${result.counts.brokenImages}`);
}
