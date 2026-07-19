#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProductionContentCycle,
  runCanonicalContentCommand,
  verifyCanonicalContentCheckpoint,
} from '../src/adapters/content-cycle-composition.mjs';
import {
  expectedUpstreamReconciliationIdentity,
  MAX_UPSTREAM_RECONCILIATION_CANDIDATES,
} from '../src/adapters/upstream-reconciliation-execution.mjs';
import {
  resolveRevision,
  runUpstreamReconciliationAudit,
} from './audit-upstream-content-reconciliation.mjs';

function usage() {
  return [
    'Usage: node scripts/reconcile-upstream-content.mjs --execute --production [--revision <ref>]',
    '',
    'The command re-fetches source-only candidates through the canonical content lifecycle.',
    'Run audit:upstream-content first. This command does not merge legacy public JSON.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    revision: 'origin/main',
    execute: false,
    production: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--execute') {
      parsed.execute = true;
      continue;
    }
    if (value === '--production') {
      parsed.production = true;
      continue;
    }
    if (value === '--help' || value === '-h') {
      parsed.help = true;
      continue;
    }
    if (value === '--revision') {
      parsed.revision = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (value.startsWith('--revision=')) {
      parsed.revision = value.slice('--revision='.length);
      continue;
    }
    throw new Error(`unknown argument: ${value}`);
  }

  return parsed;
}

export function assertExecutionBoundary(args = {}) {
  if (!args.execute || !args.production) {
    throw new Error('upstream reconciliation requires both --execute and --production');
  }
}

export function assertReconciliationProviderReadiness(env = process.env) {
  if (env.PIPELINE_OFFLINE === '1' || env.CODEX_SANDBOX_NETWORK_DISABLED === '1') {
    const error = new Error('upstream reconciliation requires online provider access');
    error.code = 'reconciliation_provider_offline';
    throw error;
  }
  if (!String(env.OPENROUTER_API_KEY || '').trim()) {
    const error = new Error('OPENROUTER_API_KEY is required for upstream reconciliation');
    error.code = 'reconciliation_editorial_provider_missing';
    throw error;
  }
  const imageProvider = String(env.IMAGE_PROVIDER || 'image2').trim();
  if (imageProvider !== 'image2') {
    const error = new Error('upstream reconciliation requires IMAGE_PROVIDER=image2');
    error.code = 'reconciliation_image_provider_invalid';
    throw error;
  }
  if (!String(env.OPENAI_API_KEY || '').trim()) {
    const error = new Error('OPENAI_API_KEY is required for upstream reconciliation Image2 generation');
    error.code = 'reconciliation_image_provider_missing';
    throw error;
  }
}

function assertReceiptIdentity(receipt, executionIdentity) {
  if (JSON.stringify(receipt?.executionIdentity) !== JSON.stringify(executionIdentity)) {
    throw new Error('canonical content cycle receipt does not match the audited reconciliation input');
  }
}

function pendingExecution(checkpoint) {
  return checkpoint && ['active', 'failed'].includes(checkpoint.status);
}

async function loadCanonicalCheckpoint() {
  return createProductionContentCycle().checkpointStore.load();
}

export async function runUpstreamReconciliation(args, options = {}) {
  assertExecutionBoundary(args);
  assertReconciliationProviderReadiness(options.env || process.env);
  const auditRunner = options.auditRunner || runUpstreamReconciliationAudit;
  const cycleRunner = options.cycleRunner || runCanonicalContentCommand;
  const checkpointLoader = options.checkpointLoader || loadCanonicalCheckpoint;
  const revisionResolver = options.revisionResolver || resolveRevision;
  const completedCheckpointVerifier = options.completedCheckpointVerifier
    || verifyCanonicalContentCheckpoint;
  const checkpoint = await checkpointLoader();

  if (pendingExecution(checkpoint)) {
    if (checkpoint.executionIdentity?.kind !== 'upstream-reconciliation') {
      throw new Error('a different canonical content cycle is active; reconciliation cannot start');
    }
    const resolvedRevision = await revisionResolver(args.revision);
    if (checkpoint.executionIdentity.revision !== resolvedRevision) {
      throw new Error('pending reconciliation belongs to a different requested revision');
    }
    const input = checkpoint.executionInput;
    const executionIdentity = expectedUpstreamReconciliationIdentity(input);
    if (JSON.stringify(checkpoint.executionIdentity) !== JSON.stringify(executionIdentity)) {
      throw new Error('pending reconciliation checkpoint identity does not match its immutable input');
    }
    const receipt = await cycleRunner('cycle', {
      production: true,
      executionIdentity,
      input,
    });
    assertReceiptIdentity(receipt, executionIdentity);
    return {
      revision: args.revision,
      resolvedRevision,
      counts: {
        upstream: input.reconciliationCandidates.length,
        alreadyPresent: 0,
        reingest: input.reconciliationCandidates.length,
        rejected: 0,
      },
      resumed: true,
      receipt,
    };
  }

  const audit = await auditRunner({ revision: args.revision });

  if (audit.counts.rejected) {
    throw new Error(`upstream audit rejected ${audit.counts.rejected} source discovery row(s)`);
  }
  if (!audit.candidates.length) {
    const outputVerification = await completedCheckpointVerifier();
    return {
      revision: audit.revision,
      resolvedRevision: audit.resolvedRevision,
      counts: audit.counts,
      outputVerification,
      receipt: null,
    };
  }
  if (audit.candidates.length > MAX_UPSTREAM_RECONCILIATION_CANDIDATES) {
    throw new Error(
      `upstream reconciliation accepts at most ${MAX_UPSTREAM_RECONCILIATION_CANDIDATES} candidates`,
    );
  }

  const input = {
    reconciliationCandidates: audit.candidates,
    reconciliationRevision: audit.resolvedRevision,
  };
  const executionIdentity = expectedUpstreamReconciliationIdentity(input);

  const receipt = await cycleRunner('cycle', {
    production: true,
    executionIdentity,
    input,
  });
  assertReceiptIdentity(receipt, executionIdentity);

  return {
    revision: audit.revision,
    resolvedRevision: audit.resolvedRevision,
    counts: audit.counts,
    resumed: false,
    receipt,
  };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  console.log(JSON.stringify(await runUpstreamReconciliation(args)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`upstream reconciliation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
