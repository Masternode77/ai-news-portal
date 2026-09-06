import fs from 'node:fs/promises';
import { registerCodexImage, generateCodexImageSet, withCodexImageLock } from './lib/codex-image-provider.mjs';
import { metadataPatchFromImageSet } from './lib/image2-provider.mjs';
const args=process.argv.slice(2);
const value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
const id=value('--id'), imageFile=value('--file');
if(!id||!imageFile)throw Error('Usage: node scripts/import-codex-image.mjs --id <article-id> --file <Codex-image-path> [--model <verified-model>]');
await withCodexImageLock('config/codex-image-import', async () => {
const collections=await Promise.all(['src/data/latest-news.json','src/data/archived-news.json'].map(async file=>({file,items:JSON.parse(await fs.readFile(file,'utf8'))})));
const collection=collections.find(c=>c.items.some(a=>a.id===id));
const article=collection?.items.find(a=>a.id===id);
if(!article)throw Error('Article not found');
const stat=await fs.stat(imageFile);if(!stat.isFile()||stat.size>25*1024*1024)throw Error('Expected a local image file up to 25 MB');
await registerCodexImage(article,await fs.readFile(imageFile),{model:value('--model')});
const result=await generateCodexImageSet(article,{throwOnError:true});
const next=collection.items.map(a=>a.id===id?{...a,...metadataPatchFromImageSet(result)}:a);
const temporary=`${collection.file}.tmp`;
await fs.writeFile(temporary,JSON.stringify(next,null,2)+'\n');await fs.rename(temporary,collection.file);
console.log(JSON.stringify({id,provider:result.provider,heroImage:result.heroImage,status:result.status}));

});
