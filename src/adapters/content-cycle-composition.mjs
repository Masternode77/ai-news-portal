import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContentCycleOrchestrator } from '../core/orchestrator/index.mjs';
import { PluginRegistry } from '../core/registry/index.mjs';
import {
  FileCycleCheckpointStore,
  FilePublicationOutputBundleStore,
  FilePublicationReceiptStore,
} from '../core/state/index.mjs';
import { PRODUCTION_CONTENT_PLUGINS } from '../plugins/content/production-content-plugins.mjs';
import { assertUpstreamReconciliationExecution } from './upstream-reconciliation-execution.mjs';

export const CONTENT_PIPELINE_VERSION = '5.6.1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function checkpointPath(env) {
  return path.resolve(ROOT, env.CONTENT_CYCLE_CHECKPOINT_PATH || '.cache/content-cycle/checkpoint.json');
}

function publicationReceiptPath(env) {
  return path.resolve(
    ROOT,
    env.CONTENT_PUBLICATION_RECEIPT_PATH || '.cache/content-cycle/publication-receipts.json',
  );
}

function publicationOutputBundlePath(env) {
  return path.resolve(
    ROOT,
    env.CONTENT_PUBLICATION_BUNDLE_PATH || '.cache/content-cycle/publication-bundles',
  );
}

export function createProductionContentCycle({
  env = process.env,
  checkpointStore,
  publicationOutputBundleStore,
  publicationReceiptStore,
} = {}) {
  const resolvedPublicationReceiptStore = publicationReceiptStore
    || new FilePublicationReceiptStore(publicationReceiptPath(env));
  const resolvedPublicationOutputBundleStore = publicationOutputBundleStore
    || new FilePublicationOutputBundleStore(publicationOutputBundlePath(env), { projectRoot: ROOT });
  const registry = new PluginRegistry({
    pluginContext: {
      publicationOutputBundleStore: resolvedPublicationOutputBundleStore,
      publicationReceiptStore: resolvedPublicationReceiptStore,
    },
  });
  for (const plugin of PRODUCTION_CONTENT_PLUGINS) registry.register(plugin);
  registry.validate();
  const resolvedCheckpointStore = checkpointStore || new FileCycleCheckpointStore(checkpointPath(env));
  return {
    registry,
    checkpointStore: resolvedCheckpointStore,
    publicationOutputBundleStore: resolvedPublicationOutputBundleStore,
    publicationReceiptStore: resolvedPublicationReceiptStore,
    orchestrator: createContentCycleOrchestrator({
      registry,
      checkpointStore: resolvedCheckpointStore,
      completedRunVerifier: async (checkpoint) => {
        const receiptState = await resolvedPublicationReceiptStore.load();
        const receipt = receiptState.publicationReceipts?.[checkpoint.runId];
        if (receipt?.status !== 'completed'
          || receipt.pipelineVersion !== checkpoint.pipelineVersion
          || receipt.result?.outputManifest?.runId !== checkpoint.runId
          || JSON.stringify(receipt.executionIdentity ?? null)
            !== JSON.stringify(checkpoint.executionIdentity ?? null)) {
          return { ok: false, code: 'completed_publication_receipt_missing' };
        }
        return resolvedPublicationOutputBundleStore.verifyAndRestore(receipt.result.outputManifest);
      },
      pipelineVersion: CONTENT_PIPELINE_VERSION,
      executionIdentityValidator: assertUpstreamReconciliationExecution,
    }),
  };
}

async function withCheckpointLease(checkpointStore, operation) {
  const releaseLease = typeof checkpointStore.acquireLease === 'function'
    ? await checkpointStore.acquireLease()
    : async () => {};
  try {
    return await operation();
  } finally {
    await releaseLease();
  }
}

export async function verifyCanonicalContentCheckpoint(options = {}) {
  const { checkpointStore, orchestrator } = createProductionContentCycle(options);
  return withCheckpointLease(checkpointStore, () => orchestrator.verifyCurrentCheckpoint());
}

export async function runCanonicalContentCommand(command, options = {}) {
  const { checkpointStore, orchestrator } = createProductionContentCycle(options);
  return withCheckpointLease(checkpointStore, async () => {
    if (command === 'cycle') {
      return await orchestrator.runCycle({
        production: options.production === true,
        input: options.input,
        executionIdentity: options.executionIdentity,
      });
    }
    return await orchestrator.runPhase(command, {
      input: options.input,
      executionIdentity: options.executionIdentity,
    });
  });
}
