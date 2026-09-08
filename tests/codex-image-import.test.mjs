import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script=fileURLToPath(new URL('../scripts/import-codex-image.mjs',import.meta.url));
test('queued imports reject revised articles before reading or writing image files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-import-revision-'));
 try {
  await fs.mkdir(path.join(root,'config'));
  await fs.mkdir(path.join(root,'src/data'),{recursive:true});
  const latest=JSON.stringify([{id:'revision-test',title:'Changed article'}]);
  await fs.writeFile(path.join(root,'src/data/latest-news.json'),latest);
  await fs.writeFile(path.join(root,'src/data/archived-news.json'),'[]');
  const result=spawnSync(process.execPath,[script,'--id','revision-test','--file','absent.png','--fingerprint','0'.repeat(64)],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Article changed after image preparation/);
  assert.equal(await fs.readFile(path.join(root,'src/data/latest-news.json'),'utf8'),latest);
  assert.deepEqual(await fs.readdir(path.join(root,'config')),[]);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('fingerprint flag requires a complete hash',()=>{
 const result=spawnSync(process.execPath,[script,'--id','x','--file','absent.png','--fingerprint'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Expected a SHA-256/);
});

test('metadata application preserves updates made while image processing was running',async()=>{
 const {applyCodexImageMetadata}=await import('../scripts/import-codex-image.mjs');
 const {imageFingerprint}=await import('../scripts/lib/codex-image-provider.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-import-merge-'));
 const file=path.join(root,'articles.json');
 const initial={id:'target',title:'Grid delivery',editorNote:'initial'};
 try {
  const fingerprint=imageFingerprint(initial);
  const refreshed=[{...initial,editorNote:'updated during generation'},{id:'new-article',title:'New story'}];
  await fs.writeFile(file,JSON.stringify(refreshed));
  await applyCodexImageMetadata(file,initial.id,fingerprint,{imageProvider:'codex'});
  const items=JSON.parse(await fs.readFile(file));
  assert.equal(items[0].editorNote,'updated during generation');
  assert.equal(items[0].imageProvider,'codex');
  assert.deepEqual(items[1],refreshed[1]);
  const revised=[{...items[0],title:'Different infrastructure decision'},items[1]];
  await fs.writeFile(file,JSON.stringify(revised));
  await assert.rejects(applyCodexImageMetadata(file,initial.id,fingerprint,{imageProvider:'codex'}),/Article changed/);
  assert.deepEqual(JSON.parse(await fs.readFile(file)),revised);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
