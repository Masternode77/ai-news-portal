import { routeEditorialArchetypeV2 } from './editorial-archetype-router-v2.mjs';

export function routeBlogStructureV2(cluster = {}, options = {}) {
  const archetype = options.archetype || routeEditorialArchetypeV2(cluster, options);
  return {
    archetype,
    headings: archetype.headings,
  };
}
