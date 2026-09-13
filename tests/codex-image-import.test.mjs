import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const script=fileURLToPath(new URL('../scripts/import-codex-image.mjs',import.meta.url));
test('queued imports reject revised articles before reading or writing image files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-import-revision-'));
 try {
  await fs.mkdir(path.join(root,'config'));
  await fs.mkdir(path.join(root,'src/data'),{recursive:true});
  const latest=JSON.stringify([{id:'revision-test',title:'Changed article'}]);
  await fs.writeFile(path.join(root,'src/data/latest-news.json'),latest);
  await fs.writeFile(path.join(root,'src/data/archived-news.json'),'[]');
  await fs.writeFile(path.join(root,'src/data/authored-columns.json'),'[]');
  const result=spawnSync(process.execPath,[script,'--id','revision-test','--file','absent.png','--fingerprint','0'.repeat(64)],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Article changed after image preparation/);
  assert.equal(await fs.readFile(path.join(root,'src/data/latest-news.json'),'utf8'),latest);
  assert.deepEqual(await fs.readdir(path.join(root,'config')),[]);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('authored column imports register artwork and preserve editorial data and other collections',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-import-column-'));
 try {
  await fs.mkdir(path.join(root,'config'));
  await fs.mkdir(path.join(root,'src/data'),{recursive:true});
  const news=JSON.stringify([{id:'news-story',title:'Existing grid news'}]);
  const archived='[]';
  const column={id:'col_artwork-test',title:'Cooling capacity constrains server procurement',category:'Cooling',body:'Preserved authored analysis',sourceUrl:'https://example.com/source',editorNote:'Reviewed'};
  const other={id:'col_other',title:'Existing column',imageProvider:'manual'};
  await fs.writeFile(path.join(root,'src/data/latest-news.json'),news);
  await fs.writeFile(path.join(root,'src/data/archived-news.json'),archived);
  await fs.writeFile(path.join(root,'src/data/authored-columns.json'),JSON.stringify([column,other]));
  const image=path.join(root,'artwork.png');
  await sharp({create:{width:640,height:360,channels:3,background:'#345678'}}).png().toFile(image);
  const result=spawnSync(process.execPath,[script,'--id',column.id,'--file',image],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const items=JSON.parse(await fs.readFile(path.join(root,'src/data/authored-columns.json'),'utf8'));
  for(const [key,value] of Object.entries(column)) assert.deepEqual(items[0][key],value);
  assert.equal(items[0].imageProvider,'codex');
  assert.equal(items[0].imageStatus,'generated');
  assert.equal(items[0].imageModel,'');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'config/codex-image-manifest.json'),'utf8'));
  assert.equal(manifest.images[column.id].provider,'codex');
  for(const key of ['heroImage','thumbnailImage','ogImage']) assert.equal((await fs.stat(path.join(root,'public',items[0][key].slice(1)))).isFile(),true);
  assert.deepEqual(items[1],other);
  assert.equal(await fs.readFile(path.join(root,'src/data/latest-news.json'),'utf8'),news);
  assert.equal(await fs.readFile(path.join(root,'src/data/archived-news.json'),'utf8'),archived);
 }finally{await fs.rm(root,{recursive:true,force:true});}
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
