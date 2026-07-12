import {
  runProductionClassify,
  runProductionCluster,
  runProductionExtract,
  runProductionGenerate,
  runProductionIngest,
  runProductionPublish,
  runProductionReview,
} from '../../../scripts/lib/production-content-phases.mjs';

const VERSION = '1.0.0';
const EMPTY_CONFIG_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
});

function createPhasePlugin({ id, phase, run, dependency, createRun }) {
  return Object.freeze({
    manifest: Object.freeze({
      id,
      version: VERSION,
      capabilities: Object.freeze([`content.${phase}`]),
      configSchema: EMPTY_CONFIG_SCHEMA,
      dependencies: Object.freeze(dependency
        ? [Object.freeze({ capability: `content.${dependency}` })]
        : []),
      enabled: true,
      migrationVersion: 1,
      healthCheck: async () => ({ ok: true, status: 'healthy' }),
    }),
    create: (context) => Object.freeze({ run: createRun ? createRun(context) : run }),
  });
}

export const productionIngestPlugin = createPhasePlugin({
  id: 'computecurrent.production-ingest',
  phase: 'ingest',
  run: runProductionIngest,
});

export const productionExtractPlugin = createPhasePlugin({
  id: 'computecurrent.production-extract',
  phase: 'extract',
  dependency: 'ingest',
  run: runProductionExtract,
});

export const productionClassifyPlugin = createPhasePlugin({
  id: 'computecurrent.production-classify',
  phase: 'classify',
  dependency: 'extract',
  run: runProductionClassify,
});

export const productionClusterPlugin = createPhasePlugin({
  id: 'computecurrent.production-cluster',
  phase: 'cluster',
  dependency: 'classify',
  run: runProductionCluster,
});

export const productionGeneratePlugin = createPhasePlugin({
  id: 'computecurrent.production-generate',
  phase: 'generate',
  dependency: 'cluster',
  run: runProductionGenerate,
});

export const productionReviewPlugin = createPhasePlugin({
  id: 'computecurrent.production-review',
  phase: 'review',
  dependency: 'generate',
  run: runProductionReview,
});

export const productionPublishPlugin = createPhasePlugin({
  id: 'computecurrent.production-publish',
  phase: 'publish',
  dependency: 'review',
  createRun: ({ publicationOutputBundleStore, publicationReceiptStore }) => (payload, context) => runProductionPublish(
    payload,
    context,
    {
      outputBundleStore: publicationOutputBundleStore,
      receiptStore: publicationReceiptStore,
    },
  ),
});

export const PRODUCTION_CONTENT_PLUGINS = Object.freeze([
  productionIngestPlugin,
  productionExtractPlugin,
  productionClassifyPlugin,
  productionClusterPlugin,
  productionGeneratePlugin,
  productionReviewPlugin,
  productionPublishPlugin,
]);
