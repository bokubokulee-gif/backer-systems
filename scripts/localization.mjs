import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export const localeCodes=['en','zh','ja','ko'];
const placeholders=value=>[...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();
const tags=value=>(value.match(/<\/?[a-z][^>]*>/g)||[]).sort();
export async function loadCatalogs(root){
 const catalogs=Object.fromEntries(await Promise.all(localeCodes.map(async code=>[code,JSON.parse(await readFile(path.join(root,'locales',code+'.json'),'utf8'))])));
 const keys=Object.keys(catalogs.en).sort();
 for(const code of localeCodes){
  if(JSON.stringify(Object.keys(catalogs[code]).sort())!==JSON.stringify(keys))throw new Error('Incomplete translation keys: '+code);
  for(const key of keys){
   const value=catalogs[code][key],source=catalogs.en[key];
   if(typeof value!=='string'||!value.trim())throw new Error('Empty translation: '+code+'/'+key);
   if(JSON.stringify(placeholders(value))!==JSON.stringify(placeholders(source)))throw new Error('Changed placeholders: '+code+'/'+key);
   if(JSON.stringify(tags(value))!==JSON.stringify(tags(source)))throw new Error('Changed inline markup: '+code+'/'+key);
   if(/kalshi|polymarket|simile|midreal|macaron|\/Users\/|backerdemo|https?:\/\//i.test(value))throw new Error('Unexpected source or link: '+code+'/'+key);
  }
 }
 return catalogs;
}
const xml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function translateSvg(svg,catalog,code){
 const tags={zh:'zh-Hans',ja:'ja-JP',ko:'ko-KR'};
 const fonts={zh:'"PingFang SC","Microsoft YaHei"',ja:'"Hiragino Kaku Gothic ProN","Yu Gothic"',ko:'"Apple SD Gothic Neo","Malgun Gothic"'};
 return svg.replace('<svg ','<svg lang="'+tags[code]+'" ')
 .replace(/(<(?:text|tspan|title|desc)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)[^<]*/g,(_,open,key)=>open+xml(catalog[key]))
 .replace(/<[^>]*\bdata-i18n-aria-label="([^"]+)"[^>]*>/g,(open,key)=>open.replace(/aria-label="[^"]*"/,()=>`aria-label="${xml(catalog[key])}"`))
 .replace('font-family:"Helvetica Neue",Arial,sans-serif','font-family:"Helvetica Neue",Arial,'+fonts[code]+',sans-serif');
}
export async function buildLocales(root,output){
 const catalogs=await loadCatalogs(root);
 const assets=path.join(root,'public/assets');
 for(const file of await readdir(assets))if(file.endsWith('.svg')){
  const source=await readFile(path.join(assets,file),'utf8');
  for(const code of localeCodes.filter(c=>c!=='en'))await writeFile(path.join(output,'assets',file.replace('.svg','.'+code+'.svg')),translateSvg(source,catalogs[code],code));
 }
 const diagramVersions={};
 for(const file of await readdir(path.join(output,'assets')))if(file.endsWith('.svg'))diagramVersions['assets/'+file]=createHash('sha256').update(await readFile(path.join(output,'assets',file))).digest('hex').slice(0,12);
 await writeFile(path.join(output,'translations.mjs'),'// Complete local translation catalogs; no remote translation service.\nexport const diagramVersions='+JSON.stringify(diagramVersions)+';\nexport default '+JSON.stringify(catalogs)+';\n');
 return catalogs;
}

export async function versionRuntime(output){
 const hash=async file=>createHash('sha256').update(await readFile(path.join(output,file))).digest('hex').slice(0,12);
 for(const [file,dependency] of [['i18n.mjs','translations.mjs'],['app.mjs','i18n.mjs']]){
  const filename=path.join(output,file);
  const source=await readFile(filename,'utf8');
  await writeFile(filename,source.replace("'./"+dependency+"'","'./"+dependency+'?v='+await hash(dependency)+"'"));
 }
 const filename=path.join(output,'index.html');
 let source=await readFile(filename,'utf8');
 for(const file of ['style.css','app.mjs'])source=source.replace('"'+file+'"','"'+file+'?v='+await hash(file)+'"');
 await writeFile(filename,source);
}
