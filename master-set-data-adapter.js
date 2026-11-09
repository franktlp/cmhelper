/* Master Set data adapter v0.2.0 — isolated, NOT loaded in production.
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
  const denominators=new Set(catalog.entries.filter(x=>x.tier==='master').map(x=>Number(String(x.number).split('/')[1])));
  const denominator=denominators.size===1?[...denominators][0]:null;
  function key(entry){
    const number=String(entry.number).trim().toLowerCase();
    const parts=/^(\d+)(?:\/(\d+))?$/.exec(number);
    const normalized=denominator&&parts&&(!parts[2]||Number(parts[2])===denominator)?String(Number(parts[1])):number;
    return normalized+'|'+normalizeVariant(entry.variant);
  }
  const owned=new Set((snap?.entries||[]).filter(x=>x.language===language&&setKey(x.set)===setKey(set)).map(key));
  const rows=variants.map(x=>({...x,owned:x.tier==='grand'?false:owned.has(key(x)),matchStatus:x.tier==='grand'?'unverified-promo-mapping':'matched-by-number-and-foil'}));
  return {status:'ok',set,language,tier,total:rows.length,owned:rows.filter(x=>x.owned).length,unverified:rows.filter(x=>x.matchStatus==='unverified-promo-mapping').length,missing:rows.filter(x=>!x.owned),inventoryUpdatedAt:snap?.updatedAt||null,catalogUpdatedAt:catalog.updatedAt};
}
window.CMMasterData={setKey,normalizeVariant,chooseCollectionFile,importCollectionFile,refreshCollection,requestCollectionPermission,getSnapshot:()=>get(SNAPSHOT),storeVerifiedCatalog,getCatalog,progress,version:'0.2.0'};
console.info('Master Set data adapter ready (isolated prototype).');
})();