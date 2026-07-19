#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeRevision } from './lib/safe-git-revision.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  return [
    'Usage: node scripts/audit-upstream-integration.mjs [options]',
    '',
    'Options:',
    '  --revision <ref>   Upstream commit or ref to evaluate (default: origin/main)',
    '  --out <path>       Write a Markdown receipt',
    '  --json <path>      Write a JSON receipt',
    '  --help             Show this help',
    '',
    'The merge simulation never writes the repository object database or working tree.',
    'Only explicitly requested receipts are written. Conflicts exit nonzero.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const parsed = { revision: 'origin/main', out: '', json: '', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      parsed.help = true;
      continue;
    }
    if (value === '--revision' || value === '--out' || value === '--json') {
      const key = value.slice(2);
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith('--')) {
        throw new Error(`missing value for ${value}`);
      }
      parsed[key] = nextValue;
      index += 1;
      continue;
    }
    const inline = value.match(/^--(revision|out|json)=(.*)$/);
    if (inline) {
      if (!inline[2]) throw new Error(`missing value for --${inline[1]}`);
      parsed[inline[1]] = inline[2];
      continue;
    }
    throw new Error(`unknown argument: ${value}`);
  }
  assertSafeRevision(parsed.revision);
  parsed.out = assertSafeReceiptPath(parsed.out, 'markdown');
  parsed.json = assertSafeReceiptPath(parsed.json, 'json');
  return parsed;
}

export function assertSafeReceiptPath(filePath = '', kind = 'markdown') {
  if (!filePath) return '';
  if (kind !== 'markdown' && kind !== 'json') {
    throw new Error(`unknown receipt kind: ${kind}`);
  }
  if (path.isAbsolute(filePath) || filePath.includes('\0')) {
    throw new Error(`unsafe receipt path: ${filePath}`);
  }
  const normalized = path.posix.normalize(filePath.replaceAll('\\', '/'));
  const allowedPrefix = kind === 'json' ? 'artifacts/' : 'docs/';
  const expectedExtension = kind === 'json' ? '.json' : '.md';
  if (
    normalized === '.'
    || normalized.startsWith('../')
    || !/^[A-Za-z0-9._/-]+$/.test(normalized)
    || !normalized.startsWith(allowedPrefix)
    || path.posix.extname(normalized) !== expectedExtension
  ) {
    throw new Error(`unsafe receipt path: ${filePath}`);
  }
  return normalized;
}

function nullSeparatedPaths(output) {
  return Buffer.from(output || '').toString('utf8').split('\0').filter(Boolean);
}

function unauditedWorkingTreePaths(root, allowedPaths = []) {
  const changed = nullSeparatedPaths(runGit(
    ['diff', '--name-only', '-z', 'HEAD'],
    { root, encoding: null },
  ));
  const untracked = nullSeparatedPaths(runGit(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    { root, encoding: null },
  ));
  const allowed = new Set(allowedPaths);
  return [...new Set([...changed, ...untracked])]
    .filter((filePath) => !allowed.has(filePath))
    .sort();
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.root || ROOT,
    encoding: options.encoding === null ? null : 'utf8',
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args[0]} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function resolveCommit(revision, root) {
  return String(runGit(
    ['rev-parse', '--verify', '--end-of-options', `${assertSafeRevision(revision)}^{commit}`],
    { root },
  )).trim();
}

function changedPaths(base, commit, root) {
  const output = runGit(
    ['diff', '--name-only', '-z', '--no-renames', `${base}..${commit}`],
    { root, encoding: null },
  );
  return new Set(Buffer.from(output).toString('utf8').split('\0').filter(Boolean));
}

function blobAt(commit, filePath, root) {
  const result = spawnSync('git', ['ls-tree', '-z', commit, '--', filePath], {
    cwd: root,
    encoding: null,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ls-tree failed: ${Buffer.from(result.stderr || '').toString('utf8').trim()}`);
  }
  if (!result.stdout?.length) return null;
  const metadata = Buffer.from(result.stdout).subarray(0, Buffer.from(result.stdout).indexOf(0x09)).toString('utf8');
  const [mode, type, oid] = metadata.split(/\s+/);
  return { mode, type, oid };
}

function isBinaryDifference(oursCommit, theirsCommit, filePath, root) {
  const output = String(runGit(
    ['diff', '--numstat', '--no-renames', oursCommit, theirsCommit, '--', filePath],
    { root },
  )).trim();
  return output.startsWith('-\t-\t');
}

async function materializeBlob(blob, target, root) {
  const handle = await fs.open(target, 'w');
  try {
    runGit(['cat-file', 'blob', blob.oid], {
      root,
      stdio: ['ignore', handle.fd, 'pipe'],
    });
  } finally {
    await handle.close();
  }
}

async function textMergeStatus({ base, ours, theirs, root, tempDirectory }) {
  const mergeDirectory = await fs.mkdtemp(path.join(tempDirectory, 'path-'));
  const baseFile = path.join(mergeDirectory, 'base');
  const oursFile = path.join(mergeDirectory, 'ours');
  const theirsFile = path.join(mergeDirectory, 'theirs');
  await Promise.all([
    materializeBlob(base, baseFile, root),
    materializeBlob(ours, oursFile, root),
    materializeBlob(theirs, theirsFile, root),
  ]);
  const result = spawnSync('git', ['merge-file', oursFile, baseFile, theirsFile], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status === null || result.status < 0 || result.status === 255) {
    throw new Error(`git merge-file failed: ${String(result.stderr || '').trim()}`);
  }
  return result.status === 0 ? 'clean' : 'content';
}

async function nativeMergeStatus({ oursCommit, theirsCommit, root, tempDirectory }) {
  const objectDirectory = path.join(tempDirectory, 'objects');
  await fs.mkdir(objectDirectory);
  const repositoryObjectPath = String(runGit(['rev-parse', '--git-path', 'objects'], { root })).trim();
  const repositoryObjectDirectory = path.isAbsolute(repositoryObjectPath)
    ? repositoryObjectPath
    : path.resolve(root, repositoryObjectPath);
  const alternateObjectDirectories = [
    repositoryObjectDirectory,
    process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES,
  ].filter(Boolean).join(path.delimiter);
  const result = spawnSync(
    'git',
    [
      'merge-tree',
      '--write-tree',
      '--name-only',
      '-z',
      '--no-messages',
      oursCommit,
      theirsCommit,
    ],
    {
      cwd: root,
      encoding: null,
      env: {
        ...process.env,
        GIT_OBJECT_DIRECTORY: objectDirectory,
        GIT_ALTERNATE_OBJECT_DIRECTORIES: alternateObjectDirectories,
      },
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    const detail = Buffer.from(result.stderr || result.stdout || '').toString('utf8').trim();
    throw new Error(`isolated git merge-tree failed${detail ? `: ${detail}` : ''}`);
  }
  const fields = Buffer.from(result.stdout || '').toString('utf8').split('\0').filter(Boolean);
  const conflictPaths = fields.slice(1);
  if (result.status === 1 && conflictPaths.length === 0) {
    throw new Error('isolated git merge-tree reported an unmapped conflict');
  }
  return {
    clean: result.status === 0,
    conflictPaths,
  };
}

export function classifyIntegrationPath(filePath = '') {
  if (filePath === 'public/dashboard-data.json') return 'retired-runtime-artifact';
  if (filePath.startsWith('public/generated/')) return 'generated-image';
  if (/^src\/data\/(?:latest-news|archived-news|search-index)\.json$/.test(filePath)) {
    return 'generated-data-projection';
  }
  return 'source-or-config';
}

async function inspectOverlap({ filePath, baseCommit, oursCommit, theirsCommit, root, tempDirectory }) {
  const base = blobAt(baseCommit, filePath, root);
  const ours = blobAt(oursCommit, filePath, root);
  const theirs = blobAt(theirsCommit, filePath, root);
  const category = classifyIntegrationPath(filePath);

  if (!ours && !theirs) return { filePath, category, result: 'clean', reason: 'deleted-both' };
  if (!ours || !theirs) {
    return { filePath, category, result: 'conflict', reason: 'modify-delete' };
  }
  if (ours.oid === theirs.oid) return { filePath, category, result: 'clean', reason: 'identical' };
  if (!base) return { filePath, category, result: 'conflict', reason: 'add-add' };
  if (base.type !== 'blob' || ours.type !== 'blob' || theirs.type !== 'blob') {
    return { filePath, category, result: 'conflict', reason: 'non-blob' };
  }
  if (isBinaryDifference(oursCommit, theirsCommit, filePath, root)) {
    return { filePath, category, result: 'conflict', reason: 'binary-content' };
  }
  const reason = await textMergeStatus({ base, ours, theirs, root, tempDirectory });
  return { filePath, category, result: reason === 'clean' ? 'clean' : 'conflict', reason };
}

export async function runUpstreamIntegrationAudit(args = {}, options = {}) {
  const root = path.resolve(options.root || ROOT);
  const requestedRevision = assertSafeRevision(args.revision || 'origin/main');
  const markdownReceipt = assertSafeReceiptPath(args.out || '', 'markdown');
  const jsonReceipt = assertSafeReceiptPath(args.json || '', 'json');
  const requestedReceiptWrites = [markdownReceipt, jsonReceipt].filter(Boolean);
  const dirtyPaths = unauditedWorkingTreePaths(root, requestedReceiptWrites);
  if (dirtyPaths.length > 0) {
    const preview = dirtyPaths.slice(0, 5).map((filePath) => JSON.stringify(filePath)).join(', ');
    throw new Error(
      `working tree contains unaudited changes (${dirtyPaths.length}): ${preview}`,
    );
  }
  const currentCommit = resolveCommit('HEAD', root);
  const upstreamCommit = resolveCommit(requestedRevision, root);
  const mergeBase = String(runGit(['merge-base', currentCommit, upstreamCommit], { root })).trim();
  const divergence = String(runGit(
    ['rev-list', '--left-right', '--count', `${currentCommit}...${upstreamCommit}`],
    { root },
  )).trim().split(/\s+/).map(Number);
  const ours = changedPaths(mergeBase, currentCommit, root);
  const theirs = changedPaths(mergeBase, upstreamCommit, root);
  const overlappingPaths = [...ours].filter((filePath) => theirs.has(filePath)).sort();
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-integration-'));
  let overlaps;
  let nativeMerge;
  try {
    nativeMerge = await nativeMergeStatus({
      oursCommit: currentCommit,
      theirsCommit: upstreamCommit,
      root,
      tempDirectory,
    });
    overlaps = [];
    for (const filePath of overlappingPaths) {
      overlaps.push(await inspectOverlap({
        filePath,
        baseCommit: mergeBase,
        oursCommit: currentCommit,
        theirsCommit: upstreamCommit,
        root,
        tempDirectory,
      }));
    }
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
  const overlapDetails = new Map(overlaps.map((item) => [item.filePath, item]));
  const nativeConflictPaths = [...new Set(nativeMerge.conflictPaths)].sort();
  const conflicts = nativeConflictPaths.map((filePath) => {
    const detail = overlapDetails.get(filePath);
    return detail?.result === 'conflict' ? detail : {
      filePath,
      category: classifyIntegrationPath(filePath),
      result: 'conflict',
      reason: 'native-merge-conflict',
    };
  });
  const unexpectedConflicts = conflicts.filter((item) => item.category === 'source-or-config');
  const integrationReady = nativeMerge.clean;
  const nativeConflictSet = new Set(nativeConflictPaths);
  const commandParts = [
    'npm run audit:integration --',
    `--revision=${requestedRevision}`,
    markdownReceipt ? `--out=${markdownReceipt}` : '',
    jsonReceipt ? `--json=${jsonReceipt}` : '',
  ].filter(Boolean);
  return {
    checkedAt: new Date().toISOString(),
    command: commandParts.join(' '),
    requestedRevision,
    currentCommit,
    upstreamCommit,
    mergeBase,
    ahead: divergence[0],
    behind: divergence[1],
    currentChangedPaths: ours.size,
    upstreamChangedPaths: theirs.size,
    overlappingPathCount: overlappingPaths.length,
    conflictCount: conflicts.length,
    cleanOverlapCount: overlaps.filter((item) => !nativeConflictSet.has(item.filePath)).length,
    unexpectedConflictCount: unexpectedConflicts.length,
    integrationReady,
    rawGeneratedMergeAllowed: false,
    nativeMergeClean: nativeMerge.clean,
    nativeConflictPaths,
    auditScriptSha256: createHash('sha256')
      .update(await fs.readFile(fileURLToPath(import.meta.url)))
      .digest('hex'),
    repositoryObjectWrites: false,
    temporaryObjectWrites: true,
    mergeWorkingTreeWrites: false,
    workingTreeWrites: requestedReceiptWrites.length > 0,
    receiptWorkingTreeWrites: requestedReceiptWrites.length,
    temporaryFilesCleaned: true,
    requestedReceiptWrites,
    overlaps,
    conflicts,
    unexpectedConflicts,
  };
}

function markdownCode(value = '') {
  const safe = String(value)
    .replace(/`/g, '\\x60')
    .replace(/[\u0000-\u001f\u007f]/g, (character) => (
      `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`
    ));
  return `\`${safe}\``;
}

export function renderIntegrationAudit(report = {}) {
  const conflictLines = report.conflicts?.length
    ? report.conflicts.map((item) => `- ${markdownCode(item.filePath)} — ${item.reason}; ${item.category}`)
    : ['- None.'];
  return [
    '# Upstream Integration Preflight',
    '',
    `Generated at: ${report.checkedAt}`,
    '',
    '## Result',
    '',
    `- Integration ready: ${report.integrationReady ? 'yes' : 'no'}`,
    `- Current commit: ${markdownCode(report.currentCommit)}`,
    `- Upstream commit: ${markdownCode(report.upstreamCommit)}`,
    `- Audit script SHA-256: ${markdownCode(report.auditScriptSha256)}`,
    `- Ahead / behind: ${report.ahead} / ${report.behind}`,
    `- Overlapping paths: ${report.overlappingPathCount}`,
    `- Conflicts: ${report.conflictCount}`,
    `- Unexpected source/config conflicts: ${report.unexpectedConflictCount}`,
    '',
    '## Commands Run',
    '',
    `- ${markdownCode(report.command)}`,
    '',
    '## Artifacts',
    '',
    ...(report.requestedReceiptWrites?.length
      ? report.requestedReceiptWrites.map((filePath) => `- ${markdownCode(filePath)}`)
      : ['- No receipt output path was requested.']),
    '',
    '## Pass/Fail',
    '',
    `- Native Git merge simulation: ${report.nativeMergeClean ? 'passed' : 'blocked by conflicts'}`,
    `- Raw upstream integration: ${report.integrationReady ? 'ready' : 'blocked'}`,
    `- Unexpected source/config conflict gate: ${report.unexpectedConflictCount === 0 ? 'passed' : 'failed closed'}`,
    '',
    '## Conflicts',
    '',
    ...conflictLines,
    '',
    '## Remaining Risks',
    '',
    ...(report.conflicts?.length
      ? ['- Upstream integration remains blocked until guarded reconciliation and projection regeneration resolve every listed conflict.']
      : ['- No merge conflict remains in this preflight; normal review and regression gates still apply.']),
    '- This receipt does not execute provider-backed content reconciliation or approve production promotion.',
    '',
    '## Cleanup Receipts',
    '',
    '- Repository Git object database writes: none',
    '- Merge-simulation working-tree writes: none',
    `- Requested receipt writes: ${report.requestedReceiptWrites?.length ? report.requestedReceiptWrites.join(', ') : 'none'}`,
    '- Isolated temporary Git objects and merge files: cleaned',
    '- Generated JSON and image conflicts must be resolved by guarded reconciliation and regenerated projections, not raw merge acceptance.',
    '',
  ].join('\n');
}

export async function writeReceipt(filePath, content, kind, root = ROOT) {
  if (!filePath) return;
  const relativePath = assertSafeReceiptPath(filePath, kind);
  const target = path.resolve(root, relativePath);
  const parent = path.dirname(target);
  const allowedBase = path.join(root, kind === 'json' ? 'artifacts' : 'docs');
  const relativeParent = path.relative(root, parent);
  let currentDirectory = root;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    currentDirectory = path.join(currentDirectory, segment);
    try {
      const componentStat = await fs.lstat(currentDirectory);
      if (componentStat.isSymbolicLink() || !componentStat.isDirectory()) {
        throw new Error(`unsafe receipt directory: ${path.relative(root, currentDirectory)}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.mkdir(currentDirectory, { mode: 0o700 });
      const createdStat = await fs.lstat(currentDirectory);
      if (createdStat.isSymbolicLink() || !createdStat.isDirectory()) {
        throw new Error(`unsafe receipt directory: ${path.relative(root, currentDirectory)}`);
      }
    }
  }
  const allowedBaseStat = await fs.lstat(allowedBase);
  if (allowedBaseStat.isSymbolicLink() || !allowedBaseStat.isDirectory()) {
    throw new Error(`unsafe receipt base: ${path.relative(root, allowedBase)}`);
  }
  const [allowedBaseRealPath, parentRealPath] = await Promise.all([
    fs.realpath(allowedBase),
    fs.realpath(parent),
  ]);
  if (
    parentRealPath !== allowedBaseRealPath
    && !parentRealPath.startsWith(`${allowedBaseRealPath}${path.sep}`)
  ) {
    throw new Error(`receipt path escapes the repository: ${relativePath}`);
  }
  try {
    const targetStat = await fs.lstat(target);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error(`unsafe receipt target: ${relativePath}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const handle = await fs.open(
    target,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(content, 'utf8');
  } finally {
    await handle.close();
  }
}

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const args = parseArgs(argv);
  const root = path.resolve(options.root || ROOT);
  const writeOutput = options.writeOutput || ((value) => console.log(value));
  if (args.help) {
    writeOutput(usage());
    return 0;
  }
  const report = await runUpstreamIntegrationAudit(args, { root });
  const markdown = renderIntegrationAudit(report);
  await writeReceipt(args.out, markdown, 'markdown', root);
  await writeReceipt(args.json, `${JSON.stringify(report, null, 2)}\n`, 'json', root);
  writeOutput(markdown);
  return report.integrationReady ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(`upstream integration audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
