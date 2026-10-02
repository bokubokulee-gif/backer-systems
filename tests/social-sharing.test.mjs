import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadCatalogs} from '../scripts/localization.mjs';
import {buildSocialSharing,imagePath,resolveSiteBase,siteBases,withoutApprovedMetadataUrls} from '../scripts/social-sharing.mjs';
const root=new URL('..',import.meta.url).pathname;

test('both host builds include initial-response large image cards and preserve language URLs',async()=>{
 const output=await mkdtemp(path.join(os.tmpdir(),'backer-systems-cards-'));
 try{
  const source=await readFile(path.join(root,'public/index.html'),'utf8');
  const catalogs=await loadCatalogs(root);
  for(const base of Object.values(siteBases)){
   await writeFile(path.join(output,'index.html'),source);
   await buildSocialSharing(output,catalogs,base);
   const html=await readFile(path.join(output,'index.html'),'utf8');
   const head=html.split('</head>')[0];
   assert.match(head,/<meta name="twitter:card" content="summary_large_image">/);
   assert.ok(head.includes(`property="og:image" content="${base}${imagePath}"`));
   assert.ok(head.includes(`name="twitter:image" content="${base}${imagePath}"`));
   assert.ok(head.includes(`property="og:url" content="${base}"`));
   assert.equal(html.split('</head>')[1],source.split('</head>')[1],'body and interactions remain unchanged');
   assert.doesNotMatch(withoutApprovedMetadataUrls(html),/https?:\/\//);
   assert.equal(await readFile(path.join(output,'robots.txt'),'utf8'),'User-agent: *\nAllow: /\n');
  }
 }finally{await rm(output,{recursive:true,force:true});}
});

test('public audit exceptions reject arbitrary external links and unapproved metadata URLs',()=>{
 const base=siteBases.vercel;
 for(const snippet of [
  `<a href="${base}">External navigation</a>`,
  `<meta name="description" content="${base}">`,
  '<meta property="og:image" content="https://unapproved.example/card.png">',
  `<meta property="og:image" content="${base}private/card.png">`,
  `<meta property="og:url" content="${base}private/">`,
  `<meta name="twitter:image" content="${base}${imagePath}?secret=value">`
 ])assert.match(withoutApprovedMetadataUrls(`<html><head>${snippet}</head></html>`),/https:\/\//);
 assert.throws(()=>resolveSiteBase('https://unapproved.example'),/Unapproved/);
});

test('bundled social card is a 4K PNG within the crawler size limit',async()=>{
 const image=await readFile(path.join(root,'public',imagePath));
 assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(image.readUInt32BE(16),3840);
 assert.equal(image.readUInt32BE(20),2016);
 assert.ok(image.length<5*1024*1024);
});

test('metadata-shaped text in scripts, styles, comments or body remains audit-visible',()=>{
 const meta=`<meta property="og:url" content="${siteBases.vercel}">`;
 for(const source of [
  `<html><head><script>const value = '${meta}';</script></head></html>`,
  `<html><head><style>body::after { content: '${meta}'; }</style></head></html>`,
  `<html><head><!-- ${meta} --></head></html>`,
  `<html><head><title>${meta}</title></head></html>`,
  `<html><head><template>${meta}</template></head></html>`,
  `<html><head></head><body>${meta}</body></html>`,
  `<html><head></head><body><head>${meta}</head></body></html>`,
  `<!-- <head> -->${meta}<!-- </head> -->`,
  `<html><head><div>${meta}</div></html>`,
  `<html><head>body text${meta}</html>`
 ])assert.match(withoutApprovedMetadataUrls(source),/https:\/\//,source);
 assert.doesNotMatch(withoutApprovedMetadataUrls(`<html><head>${meta}</head><body></body></html>`),/https:\/\//);
});
