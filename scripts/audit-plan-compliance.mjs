import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_EVIDENCE = 'evidence/compute-current-omo-ultra-rebuild/f1-plan-compliance.json';
const REQUIRED_REPORTS = [
  'docs/omo-ultra-implementation-report.md',
  'docs/modern-design-report.md',
  'docs/humanized-blog-engine-report.md',
  'docs/image-generation-report.md',
  'docs/admin-cms-report.md',
  'docs/legacy-migration-report.md',
  'docs/public-qa-report.md',
  'docs/deployment-checklist.md',
  'docs/production-verification-report.md',
];

function topLevelImplementationTasks(planText = '') {
  return planText
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^- \[( |x)\] (\d+)\. (.+)$/);
      if (!match) return null;
      return { line: index + 1, checked: match[1] === 'x', number: Number(match[2]), title: match[3] };
    })
    .filter(Boolean)
    .filter((item) => item.number >= 1 && item.number <= 16);
}

function finalWaveTasks(planText = '') {
  return planText
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^- \[( |x)\] (F\d+)\. (.+)$/);
      if (!match) return null;
      return { line: index + 1, checked: match[1] === 'x', id: match[2], title: match[3] };
    })
    .filter(Boolean);
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

export function auditPlanCompliance(planPath) {
  const text = fs.readFileSync(planPath, 'utf8');
  const implementationTasks = topLevelImplementationTasks(text);
  const finalTasks = finalWaveTasks(text);
  const missingImplementationNumbers = Array.from({ length: 16 }, (_, index) => index + 1)
    .filter((number) => !implementationTasks.some((task) => task.number === number));
  const uncheckedImplementation = implementationTasks.filter((task) => !task.checked);
  const missingReports = REQUIRED_REPORTS.filter((report) => !exists(report));
  const result = {
    generatedAt: new Date().toISOString(),
    planPath,
    ok: missingImplementationNumbers.length === 0 && uncheckedImplementation.length === 0 && missingReports.length === 0,
    implementationTasks,
    finalWaveTasks: finalTasks,
    missingImplementationNumbers,
    uncheckedImplementation,
    requiredReports: REQUIRED_REPORTS.map((report) => ({ path: report, exists: exists(report) })),
    missingReports,
  };
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('audit-plan-compliance.mjs')) {
  const planPath = process.argv[2];
  const outPath = process.argv[3] || DEFAULT_EVIDENCE;
  if (!planPath) {
    console.error('Usage: node scripts/audit-plan-compliance.mjs <plan-path> [out-json]');
    process.exit(1);
  }
  const result = auditPlanCompliance(planPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
