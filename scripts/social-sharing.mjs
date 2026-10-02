import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {localeCodes} from './localization.mjs';

export const siteBases=Object.freeze({
 vercel:'https://backer-systems.vercel.app/',
 github:'https://bokubokulee-gif.github.io/backer-systems/'
});
export const imagePath='img/backer-social-20261002.png';
const locales={en:'en_US',zh:'zh_CN',ja:'ja_JP',ko:'ko_KR'};
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function resolveSiteBase(value=process.env.SITE_URL||siteBases.vercel){
 const normalized=value.replace(/\/+$/,'')+'/';
 if(!Object.values(siteBases).includes(normalized))throw new Error('Unapproved social sharing SITE_URL');
 return normalized;
}
export function metadata(catalog,code,base,filename){
 const url=new URL(filename,base).href,image=new URL(imagePath,base).href;
 const fields=[
  ['property','og:type','website'],['property','og:site_name','Backer'],
  ['property','og:title',catalog.h001],['property','og:description',catalog.h002],
  ['property','og:url',url],['property','og:locale',locales[code]],
  ...localeCodes.filter(other=>other!==code).map(other=>['property','og:locale:alternate',locales[other]]),
  ['property','og:image',image],['property','og:image:secure_url',image],
  ['property','og:image:type','image/png'],['property','og:image:width','3840'],['property','og:image:height','2016'],
  ['property','og:image:alt','Backer AI — Predict where attention flows. Simulation science. Better decisions.'],
  ['name','twitter:card','summary_large_image'],['name','twitter:site','@backer_ai'],
  ['name','twitter:title',catalog.h001],['name','twitter:description',catalog.h002],
  ['name','twitter:image',image],['name','twitter:image:alt','Backer AI — Predict where attention flows. Simulation science. Better decisions.']
 ];
 return fields.map(([attribute,key,value])=>`<meta ${attribute}="${key}" content="${xml(value)}">`).join('\n');
}
export async function buildSocialSharing(output,catalogs,base=resolveSiteBase()){
 const original=await readFile(path.join(output,'index.html'),'utf8');
 await writeFile(path.join(output,'index.html'),original.replace('</head>',metadata(catalogs.en,'en',base,'')+'\n</head>'));
 await writeFile(path.join(output,'robots.txt'),'User-agent: *\nAllow: /\n');
}

// Allow only exact crawler metadata tags with approved public URLs. Other URLs,
// including an approved host embedded in body copy or scripts, remain forbidden.
export function withoutApprovedMetadataUrls(source){
 const imageUrls=Object.values(siteBases).map(base=>new URL(imagePath,base).href);
 const pageUrls=Object.values(siteBases);
 // Tokenize comments and raw-text elements as opaque blocks so metadata-shaped
 // text inside them cannot gain an exception. Only the first document head counts.
 const tokens=/<!--[\s\S]*?(?:-->|$)|<(script|style|title|textarea|xmp|iframe|noembed|noframes|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)|<(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
 let headState='before',cursor=0;
 return source.replace(tokens,(tag,rawElement,offset)=>{
  if(headState==='inside'&&source.slice(cursor,offset).trim())headState='after';
  cursor=offset+tag.length;
  if(tag.startsWith('<!--')||rawElement)return tag;
  if(headState==='before'&&/^<head(?:\s[^>]*)?>$/i.test(tag)){headState='inside';return tag;}
  if(/^<\/?(?:head|body)\b/i.test(tag)){headState='after';return tag;}
  if(headState!=='inside')return tag;
  if(!/^<(?:meta|link|base)\b/i.test(tag)){headState='after';return tag;}
  const match=tag.match(/^<meta (property|name)="([^"]+)" content="([^"]+)">$/);
  if(!match)return tag;
  const [,attribute,key,value]=match;
  const isImage=(attribute==='property'&&['og:image','og:image:secure_url'].includes(key))||(attribute==='name'&&key==='twitter:image');
  if(isImage&&imageUrls.includes(value))return '';
  if(attribute==='property'&&key==='og:url'&&pageUrls.includes(value))return '';
  return tag;
 });
}
