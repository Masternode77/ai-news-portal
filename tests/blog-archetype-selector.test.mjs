import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBlogArchetype } from '../scripts/lib/blog-archetype-selector.mjs';

test('archetype selector routes memory stories to memory economics when available', () => {
  const archetype = selectBlogArchetype({ title: 'HBM memory pricing changes AI capacity planning' });
  assert.equal(archetype.name, 'Memory Economics Brief');
});
