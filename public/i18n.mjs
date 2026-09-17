import catalogs,{diagramVersions} from './translations.mjs';
export const languages = Object.freeze({en:{label:'English',tag:'en-US'},zh:{label:'中文',tag:'zh-Hans'},ja:{label:'日本語',tag:'ja-JP'},ko:{label:'한국어',tag:'ko-KR'}});
const sourceKeys = new Map(Object.entries(catalogs.en).map(([key,value])=>[value,key]));
const preferenceKey='backer-systems-language';
const valid=value=>Object.hasOwn(languages,value);
let current='en';
try { const explicit=new URL(location.href).searchParams.get('lang');const saved=localStorage.getItem(preferenceKey);current=valid(explicit)?explicit:valid(saved)?saved:'en'; } catch {}
export const language=()=>current;
export const numberLocale=()=>languages[current].tag;
export function translate(source,variables={}) {
 const key=sourceKeys.get(source);
 const template=key?(catalogs[current][key]??source):source;
 return template.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(variables,name)?String(variables[name]):match);
}
const attributes=['aria-label','title','alt','content'];
const diagrams=[];
function renderStatic(){
 document.documentElement.lang=languages[current].tag;
 document.querySelectorAll('[data-i18n]').forEach(element=>{element.innerHTML=catalogs[current][element.dataset.i18n];});
 for(const attribute of attributes)document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element=>element.setAttribute(attribute,catalogs[current][element.getAttribute(`data-i18n-${attribute}`)]));
 for(const {element,attribute,source} of diagrams){const file=current==='en'?source:source.replace(/\.svg$/,`.${current}.svg`);element.setAttribute(attribute,file+'?v='+diagramVersions[file]);}
 document.getElementById('language-current').textContent=languages[current].label;
 document.getElementById('language-button').setAttribute('aria-label',translate('Change language')+': '+languages[current].label);
 document.getElementById('language-menu').setAttribute('aria-label',translate('Language'));
 document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-checked',String(button.dataset.language===current)));
}
export function initializeLanguage(){
 for(const attribute of ['src','srcset','href'])document.querySelectorAll(`[${attribute}$=".svg"]`).forEach(element=>diagrams.push({element,attribute,source:element.getAttribute(attribute)}));
 const trigger=document.getElementById('language-button'),menu=document.getElementById('language-menu');
 const options=[...menu.querySelectorAll('[data-language]')];
 function close(restoreFocus=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger.focus();}
 function open(){menu.hidden=false;trigger.setAttribute('aria-expanded','true');options.find(b=>b.dataset.language===current).focus();}
 trigger.addEventListener('click',()=>menu.hidden?open():close());
 trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open();}});
 options.forEach((button,index)=>{
  button.addEventListener('click',()=>{
   current=button.dataset.language;
   try{localStorage.setItem(preferenceKey,current);}catch{}
   const url=new URL(location.href);url.searchParams.set('lang',current);history.replaceState(null,'',url);
   renderStatic();window.dispatchEvent(new CustomEvent('languagechange',{detail:{language:current}}));close(true);
  });
  button.addEventListener('keydown',event=>{
   let next;
   if(event.key==='ArrowDown')next=(index+1)%options.length;
   else if(event.key==='ArrowUp')next=(index+options.length-1)%options.length;
   else if(event.key==='Home')next=0;
   else if(event.key==='End')next=options.length-1;
   else if(event.key==='Escape'){event.preventDefault();close(true);return;}
   else if(event.key==='Tab'){close();return;}
   else return;
   event.preventDefault();options[next].focus();
  });
 });
 document.addEventListener('click',event=>{if(!event.target.closest('.language-picker'))close();});
 renderStatic();
}
