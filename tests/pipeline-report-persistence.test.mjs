import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('scheduled publication commits the taxonomy report generated from the same inventory',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/update-news.yml',import.meta.url),'utf8');
 const commitStep=workflow.split('- name: Commit and push updates')[1];
 assert.ok(commitStep);
 const staged=commitStep.split('git add')[1].split('if git diff')[0];
 assert.match(staged,/src\/data\/taxonomy-pages\.json/);
 assert.match(staged,/docs\/taxonomy-pages-report\.md/);
});
