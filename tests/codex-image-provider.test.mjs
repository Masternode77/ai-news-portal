import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { registerCodexImage, generateCodexImageSet } from '../scripts/lib/codex-image-provider.mjs';
import {createImageProvider} from '../scripts/lib/image-providers/index.mjs';
const article={id:'codex-test',title:'Grid delivery limits a data-center campus',category:'Power & Grid'};
test('registered Codex artwork works without network and rejects stale or tampered files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-codex-'));
 const options={publicDir:root,manifestPath:path.join(root,'manifest.json')};
 const previousFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Image workflow must not fetch');};
 try {
  const bytes=await sharp({create:{width:640,height:360,channels:3,background:'#345678'}}).png().toBuffer();
  const entry=await registerCodexImage(article,bytes,options);
  const result=await generateCodexImageSet(article,options);
  assert.equal(result.provider,'codex');assert.equal(result.status,'generated');assert.equal(result.model,'');
  assert.equal((await fs.stat(path.join(root,result.heroImage.slice(1)))).isFile(),true);
  const stale=await generateCodexImageSet({...article,title:'Entirely different cooling story'},options);
  assert.equal(stale.provider,'local');assert.match(stale.error,/earlier article revision/);
  await fs.writeFile(path.join(root,entry.sourcePath.slice(1)),'tampered');
  const corrupt=await generateCodexImageSet(article,options);assert.equal(corrupt.status,'fallback');assert.match(corrupt.error,/integrity/);
 } finally {globalThis.fetch=previousFetch;await fs.rm(root,{recursive:true,force:true});}
});
test('paid image provider names are disabled and no registered artwork stays local',async()=>{
 assert.equal(createImageProvider('openai-api'),null);assert.equal(createImageProvider('chatgpt'),null);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-codex-none-'));
 try {const result=await generateCodexImageSet(article,{publicDir:root,manifestPath:path.join(root,'absent.json'),apiKey:'should-not-be-used'});assert.equal(result.provider,'local');assert.equal(result.status,'fallback');assert.doesNotMatch(result.error,/API_KEY/);}
 finally {await fs.rm(root,{recursive:true,force:true});}
});
test('Codex registration rejects undersized or non-image input before manifest updates',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-codex-invalid-'));const options={publicDir:root,manifestPath:path.join(root,'manifest.json')};
 try {
 await assert.rejects(registerCodexImage(article,Buffer.from('not-image'),options));
 const small=await sharp({create:{width:10,height:10,channels:3,background:'#000'}}).png().toBuffer();
 await assert.rejects(registerCodexImage(article,small,options),/at least/);
 await assert.rejects(fs.stat(options.manifestPath),{code:'ENOENT'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('parallel Codex registrations preserve every successful manifest entry',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-codex-parallel-'));const options={publicDir:root,manifestPath:path.join(root,'manifest.json')};
 try {
  const bytes=await sharp({create:{width:640,height:360,channels:3,background:'#765432'}}).png().toBuffer();
  await Promise.all(Array.from({length:6},(_,i)=>registerCodexImage({...article,id:`parallel-${i}`},bytes,options)));
  const manifest=JSON.parse(await fs.readFile(options.manifestPath,'utf8'));
  assert.equal(Object.keys(manifest.images).length,6);
  await assert.rejects(fs.stat(`${options.manifestPath}.lock`),{code:'ENOENT'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('missing artwork ignores API credentials without any network call',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-codex-network-'));let requests=0;
 const previousFetch=globalThis.fetch;globalThis.fetch=()=>{requests++;throw Error('Network forbidden');};
 try {const result=await generateCodexImageSet(article,{publicDir:root,manifestPath:path.join(root,'missing.json'),apiKey:'unused'});assert.equal(result.status,'fallback');assert.equal(requests,0);}
 finally{globalThis.fetch=previousFetch;await fs.rm(root,{recursive:true,force:true});}
});

test('registration locks record their owner and release on failed operations',async()=>{
 const {withCodexImageLock}=await import('../scripts/lib/codex-image-provider.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cc-codex-lock-'));const file=path.join(root,'manifest');
 try {
  await assert.rejects(withCodexImageLock(file,async()=>{const owner=JSON.parse(await fs.readFile(`${file}.lock`,'utf8'));assert.equal(owner.pid,process.pid);assert.ok(Number.isFinite(Date.parse(owner.createdAt)));throw Error('interrupted operation');}),/interrupted operation/);
  await assert.rejects(fs.stat(`${file}.lock`),{code:'ENOENT'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
