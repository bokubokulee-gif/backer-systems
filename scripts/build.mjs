import {buildLocales,versionRuntime} from './localization.mjs';
import {buildSocialSharing,withoutApprovedMetadataUrls} from './social-sharing.mjs';
import {cp,mkdir,rm,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
async function audit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await audit(file);else if(/\.(html|css|mjs|svg)$/.test(entry.name)){const source=(await readFile(file,'utf8')).replaceAll('http://www.w3.org/2000/svg','');const data=entry.name.endsWith('.html')?withoutApprovedMetadataUrls(source):source;if(/kalshi|polymarket|simile|midreal|macaron|\/Users\/|backerdemo|https?:\/\//i.test(data))throw new Error('Unexpected source name, external link or local path in public artifact: '+file);}}}
await audit(path.join(root,'public'));
await rm(path.join(root,'dist'),{recursive:true,force:true});await mkdir(path.join(root,'dist'),{recursive:true});await cp(path.join(root,'public'),path.join(root,'dist'),{recursive:true});
const catalogs=await buildLocales(root,path.join(root,'dist'));
await versionRuntime(path.join(root,'dist'));
await buildSocialSharing(path.join(root,'dist'),catalogs);
await audit(path.join(root,'dist'));
console.log('Built audited four-language standalone site in dist/');
