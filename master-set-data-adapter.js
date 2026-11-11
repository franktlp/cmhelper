/* Master Set data adapter — collection, checklist and search persistence.
 * File System Access requires a user gesture and a supported secure browser.
 * PokéCottage imports require a validated source-specific parser; never fabricate variants.
 */
(()=>{'use strict';
const DB='cm_master_set_data_v1', STORE='records', HANDLE='tcgcollector-file', SNAPSHOT='tcgcollector-snapshot';
const openDB=()=>new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
async function transaction(mode,operation){const db=await openDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),s=tx.objectStore(STORE),req=operation(s);tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error||Error('Operación de almacenamiento cancelada'))})}finally{db.close()}}
const get=k=>transaction('readonly',s=>s.get(k)),put=(k,v)=>transaction('readwrite',s=>s.put(v,k));
function parseCSV(text){const rows=[];let row=[],value='',quote=false;const delimiter=(()=>{const first=String(text).split(/\r?\n/,1)[0];return first.includes('\t')?'\t':first.includes(';')&&!first.includes(',')?';':','})();text=String(text).replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){value+='"';i++}else quote=!quote}else if(!quote&&c===delimiter){row.push(value);value=''}else if(!quote&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value=''}else value+=c}row.push(value);if(row.some(x=>x.trim()))rows.push(row);const headers=rows.shift()?.map(x=>x.trim())||[];return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])))}
const setKey=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
function normalizeVariant(v){
  const s=String(v||'').trim().toLowerCase();
  const key=setKey(s);
  if(/^pokeball(?:pattern|reverseholo|holo)?$/.test(key))return 'poké ball';
  if(/^masterball(?:pattern|reverseholo|holo)?$/.test(key))return 'master ball';
  return ({normalholo:'holo',standard:'normal',nonholo:'normal',reverseholo:'reverse'})[key]||s;
}
function numberKey(value,denominator=null){
  const text=String(value||'').trim().toUpperCase().replace(/\s+/g,'');
  const numbered=/^(\d+)(?:\/(\d+))?$/.exec(text);
  if(numbered){
    if(!numbered[2]||denominator&&Number(numbered[2])===denominator)return String(Number(numbered[1]));
    return Number(numbered[1])+'/'+Number(numbered[2]);
  }
  const code=/^(CC|MEE)0*(\d+)(?:\/(\d+))?$/.exec(text);
  return code?code[1]+':'+Number(code[2])+(code[3]&&!(code[1]==='CC'&&Number(code[3])===30)?'/'+Number(code[3]):''):text;
}
// Cardmarket's 30C spoiler uses original print numbers for Classic Collection.
// https://www.cardmarket.com/en/Pokemon/Spoilers/30th-Celebration
const classicPrints='BS 58|BS 4|GH 18|GC 69|NG 25|NDE 106|AQ 149|RS 5|TRR 19|UF 108|DS 11|GE 106|LA 43|PL 47|TM 94|TM 99|TM 100|NVI 101|DRX 85|PLB 97|PRC 106|BKP 41|SUM 89|CIN 57|TEU 33|SSH 138|VIV 50|FST 114|BRS 123|PAL 203'.split('|');
function marketNumberKey(code,printed,denominator){
  code=String(code).toUpperCase();
  const token=String(printed).trim().toUpperCase().replace(/\s+/g,' ');
  if(code==='MEE'&&/^\d+$/.test(token))return numberKey('MEE '+token);
  if(code==='30C'){
    const classic=/^([A-Z]+)\s+0*(\d+)$/.exec(token);
    if(classic){const index=classicPrints.indexOf(classic[1]+' '+Number(classic[2]));return index<0?null:'CC:'+(index+1)}
    if(/^[BGR]\/RGB$/.test(token))return token;
  }
  return /^\d+$/.test(token)?numberKey(token,denominator):null;
}
const languages={Spanish:'es',English:'en',Japanese:'ja',French:'fr',German:'de',Italian:'it',Portuguese:'pt'};
function decodeCollection(csv){const records=parseCSV(csv);if(!records.length||!['Expansion','Card number','Card variant','Card language','Quantity'].every(k=>k in records[0]))throw Error('El archivo no parece una exportación válida de TCGCollector');return records.map(r=>({set:r.Expansion,number:r['Card number'],name:r['Card name'],variant:normalizeVariant(r['Card variant']),language:languages[r['Card language']]||r['Card language'],quantity:Number(r.Quantity)||0})).filter(x=>x.set&&x.number&&x.quantity>0)}
async function chooseCollectionFile(){if(!window.showOpenFilePicker)return {status:'file-picker-unavailable'};const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'TCGCollector CSV',accept:{'text/csv':['.csv']}}]});if(!handle)return null;const file=await handle.getFile(),entries=decodeCollection(await file.text());await put(HANDLE,handle);await put(SNAPSHOT,{entries,filename:file.name,modified:file.lastModified,updatedAt:Date.now()});return {entries:entries.length,filename:file.name,modified:file.lastModified}}
async function importCollectionFile(file){if(!file)throw Error('No se ha seleccionado ningún archivo');const entries=decodeCollection(await file.text());await put(SNAPSHOT,{entries,filename:file.name,modified:file.lastModified,updatedAt:Date.now()});return {status:'imported',entries:entries.length,filename:file.name}}
async function refreshCollection(){const handle=await get(HANDLE);if(!handle)return {status:'cached-only',snapshot:await get(SNAPSHOT)};const permission=await handle.queryPermission({mode:'read'});if(permission!=='granted')return {status:'permission-required',snapshot:await get(SNAPSHOT)};const file=await handle.getFile(),previous=await get(SNAPSHOT);if(previous?.modified===file.lastModified&&previous?.filename===file.name)return {status:'unchanged',entries:previous.entries.length};const entries=decodeCollection(await file.text());await put(SNAPSHOT,{entries,filename:file.name,modified:file.lastModified,updatedAt:Date.now()});return {status:'updated',entries:entries.length}}
async function requestCollectionPermission(){const handle=await get(HANDLE);if(!handle)return {status:'not-selected'};const result=await handle.requestPermission({mode:'read'});return result==='granted'?refreshCollection():{status:'permission-denied'}}
function validateCatalog(entries){if(!Array.isArray(entries)||!entries.length)throw Error('Catálogo vacío');for(const x of entries)if(!x.set||!x.number||!x.variant||!['master','grand'].includes(x.tier))throw Error('Variante incompleta o categoría inválida');return entries}
async function storeVerifiedCatalog(set,entries,metadata={}){validateCatalog(entries);if(entries.some(x=>x.set!==set))throw Error('El catálogo contiene otra colección');await put('catalog:'+set,{entries,metadata,updatedAt:Date.now()});return entries.length}
async function getCatalog(set){return get('catalog:'+set)}
async function progress(set,language,tier){
  const [snap,catalog]=await Promise.all([get(SNAPSHOT),getCatalog(set)]);
  if(!catalog)return {status:'catalog-missing'};
  const variants=catalog.entries.filter(x=>(x.language==='all'||x.language===language)&&(tier==='grand'||x.tier==='master'));
  const denominators=new Set(catalog.entries.filter(x=>x.tier==='master'&&/^\d+\/\d+$/.test(x.number)).map(x=>Number(String(x.number).split('/')[1])));
  const denominator=denominators.size===1?[...denominators][0]:null;
  function key(entry){
    return numberKey(entry.number,denominator)+'|'+normalizeVariant(entry.variant);
  }
  const owned=new Set();
  for(const entry of snap?.entries||[]){
    if(entry.language!==language||!(entry.quantity>0))continue;
    if(setKey(entry.set)===setKey(set)){owned.add(key(entry));continue}
    // TCGCollector puts these shared cards in their own expansion and exports
    // bare numbers (009), whereas the 30C checklist prints MEE 009.
    // Keep the prefix, language and finish: normal energies never own holo ones.
    if(setKey(set)==='30thcelebration'&&setKey(entry.set)==='megaevolutionenergies'){
      const number=numberKey(entry.number);
      if(/^(?:MEE:)?[0-9]+$/.test(number)){
        const energyNumber=Number(number.replace(/^MEE:/,''));
        if(energyNumber>=1&&energyNumber<=16)
          owned.add('MEE:'+energyNumber+'|'+normalizeVariant(entry.variant));
      }
    }
  }
  const rows=variants.map(x=>({...x,owned:x.tier==='grand'?false:owned.has(key(x)),matchStatus:x.tier==='grand'?'unverified-promo-mapping':'matched-by-number-and-foil'}));
  return {status:'ok',set,language,tier,total:rows.length,owned:rows.filter(x=>x.owned).length,unverified:rows.filter(x=>x.matchStatus==='unverified-promo-mapping').length,missing:rows.filter(x=>!x.owned),inventoryUpdatedAt:snap?.updatedAt||null,catalogUpdatedAt:catalog.updatedAt};
}
const SEARCH_TTL=24*60*60*1000;
const searchKey=(set,language)=>'search:'+setKey(set)+':'+language;
async function saveSearch(set,language,data){
  await put(searchKey(set,language),{...data,savedAt:Date.now(),schema:1});
}
async function getSearch(set,language){
  const saved=await get(searchKey(set,language));
  if(saved?.schema!==1||Date.now()-(saved.scan?.createdAt||saved.savedAt)>SEARCH_TTL)return null;
  return saved;
}
window.CMMasterData={saveSearch,getSearch,numberKey,marketNumberKey,setKey,normalizeVariant,chooseCollectionFile,importCollectionFile,refreshCollection,requestCollectionPermission,getSnapshot:()=>get(SNAPSHOT),storeVerifiedCatalog,getCatalog,progress,version:'0.2.1'};
console.info('Master Set data adapter ready.');
})();