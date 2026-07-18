import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('third-party workflow actions are pinned to immutable commit SHAs', () => {
  const workflowDir = '.github/workflows';
  const workflowFiles = fs.readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/i.test(name));
  const mutable = [];
  let actionCount = 0;

  for (const name of workflowFiles) {
    const file = path.join(workflowDir, name);
    const workflow = fs.readFileSync(file, 'utf8');
    for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
      const action = match[1];
      if (action.startsWith('./')) continue;
      actionCount += 1;
      const ref = action.split('@').at(-1) || '';
      if (!/^[a-f0-9]{40}$/.test(ref)) mutable.push(`${file}:${action}`);
    }
  }

  assert.ok(actionCount > 0, 'expected at least one third-party workflow action');
  assert.deepEqual(mutable, []);
});
