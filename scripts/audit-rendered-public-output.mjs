import { auditRenderedPublicOutput, renderedOutputReportPath } from './lib/rendered-output-audit.mjs';

const result = await auditRenderedPublicOutput({ reportPath: renderedOutputReportPath });

if (!result.ok) {
  console.error(`rendered public output audit failed:\n${result.failures.slice(0, 80).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`rendered public output audit passed: pages=${result.counts.pages}, articles=${result.counts.articlePages}, cards=${result.counts.cards}, brokenImages=${result.counts.brokenImages}`);
}
