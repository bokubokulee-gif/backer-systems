import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {loadCatalogs,translateSvg} from '../scripts/localization.mjs';
const root=new URL('..',import.meta.url).pathname;
test('all four catalogs preserve technical placeholders and inline structure',async()=>{
 const catalogs=await loadCatalogs(root);
 assert.equal(Object.keys(catalogs.en).length,392);
 for(const code of ['zh','ja','ko']){
  const translated=Object.keys(catalogs.en).filter(key=>catalogs[code][key]!==catalogs.en[key]);
  assert.ok(translated.length>350,`${code} must contain full translations, not fallback English`);
 }
});
test('every page and diagram translation reference has an English source',async()=>{
 const catalogs=await loadCatalogs(root);
 const files=['public/index.html',...(await readdir(root+'public/assets')).filter(f=>f.endsWith('.svg')).map(f=>'public/assets/'+f)];
 for(const file of files){
  const source=await readFile(root+file,'utf8');
  for(const match of source.matchAll(/data-i18n(?:-aria-label|-title|-alt|-content)?="([^"]+)"/g))assert.ok(catalogs.en[match[1]],`${file}: ${match[1]}`);
 }
});
test('localized SVGs translate text and accessible descriptions without altering geometry',async()=>{
 const catalogs=await loadCatalogs(root);
 const source=await readFile(root+'public/assets/data-flywheel.svg','utf8');
 for(const code of ['zh','ja','ko']){
  const result=translateSvg(source,catalogs[code],code);
  assert.match(result,/viewBox="0 0 560 550"/);
  assert.equal((result.match(/<circle\b/g)||[]).length,(source.match(/<circle\b/g)||[]).length);
  assert.ok(!result.includes('Proposed loop · external outcomes govern learning.'));
  assert.ok(!result.includes('aria-label="01 Observe context"'));
 }
});
