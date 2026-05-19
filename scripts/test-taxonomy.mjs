import assert from 'node:assert/strict';
import {
  ARTICLE_TYPES,
  INFRASTRUCTURE_LAYERS,
  PRIMARY_CATEGORIES,
  classifyTaxonomy,
  taxonomySearchFields,
} from './lib/taxonomy.mjs';

const powerArticle = classifyTaxonomy({
  title: 'Utility pauses AI data center grid connections after requests hit 60 GW',
  snippet: 'Data center developers face interconnection and substation limits for AI campuses.',
  contentText: 'Power procurement and grid access are the bottlenecks for new GPU cluster capacity.',
  infrastructure_relevance_score: 0.96,
  data_center_relevance: 0.8,
  power_grid_relevance: 1,
  region: 'EU',
});

assert.equal(powerArticle.primary_category, 'Power & Grid');
assert.equal(powerArticle.infrastructure_layer, 'Power');
assert.equal(powerArticle.article_type, 'Capacity Expansion');
assert.ok(powerArticle.affected_stakeholders.includes('utilities'));
assert.ok(powerArticle.urgency_score >= 0.5);
assert.ok(PRIMARY_CATEGORIES.includes(powerArticle.primary_category));
assert.ok(INFRASTRUCTURE_LAYERS.includes(powerArticle.infrastructure_layer));
assert.ok(ARTICLE_TYPES.includes(powerArticle.article_type));

const aiOverride = classifyTaxonomy(
  {
    title: 'Cloud provider launches new GPU instances for enterprise inference',
    snippet: 'The release gives cloud buyers more accelerator capacity for AI workloads.',
    infrastructure_relevance_score: 0.8,
    cloud_capacity_relevance: 0.9,
  },
  {
    primary_category: 'Cloud Capacity',
    secondary_category: 'GPU instance availability',
    infrastructure_layer: 'Cloud Platform',
    affected_stakeholders: ['cloud buyers', 'enterprise IT'],
    article_type: 'Product / Platform Update',
    region: 'US',
    urgency_score: 0.61,
  }
);

assert.equal(aiOverride.primary_category, 'Cloud Capacity');
assert.equal(aiOverride.secondary_category, 'GPU instance availability');
assert.equal(aiOverride.infrastructure_layer, 'Cloud Platform');
assert.equal(aiOverride.article_type, 'Product / Platform Update');
assert.equal(aiOverride.region, 'US');
assert.equal(aiOverride.urgency_score, 0.61);
assert.ok(aiOverride.affected_stakeholders.includes('cloud buyers'));

const invalidOverride = classifyTaxonomy(
  {
    title: 'Liquid cooling vendor expands CDU manufacturing',
    snippet: 'Higher rack density is increasing demand for thermal systems.',
  },
  {
    primary_category: 'Everything Bagel',
    infrastructure_layer: 'Vibes',
    article_type: 'Hot Take',
    urgency_score: 4,
  }
);

assert.equal(invalidOverride.primary_category, 'Cooling & Facility Engineering');
assert.equal(invalidOverride.infrastructure_layer, 'Cooling');
assert.equal(invalidOverride.article_type, 'Capacity Expansion');
assert.equal(invalidOverride.urgency_score, 1);

const searchFields = taxonomySearchFields({
  primary_category: 'Semiconductors',
  secondary_category: 'HBM supply',
  infrastructure_layer: 'Silicon',
  article_type: 'Supply Chain',
  region: 'APAC',
  affected_stakeholders: ['semiconductor suppliers', 'hyperscalers'],
});

assert.deepEqual(searchFields, [
  'Semiconductors',
  'HBM supply',
  'Silicon',
  'Supply Chain',
  'APAC',
  'semiconductor suppliers',
  'hyperscalers',
]);

console.log('taxonomy test passed');
