/* Master Set Manager UI beta 0.5.0 — loaded only by feature branch loader.
 * Requires CMMasterData and CMPokeCottageXLSX. No Cardmarket purchase actions.
 */
(()=>{'use strict';
if(window.CMMasterUI)return;
const SETTINGS='cm_master_ui_settings_v1', state=(()=>{try{return JSON.parse(localStorage.getItem(SETTINGS))||{}}catch{return {}}})();
state.lang ||= 'es';state.tier ||= 'master';
const registry=window.__cmMasterRegistry;
const imports=new Map();
function detectExpansion(){
  const raw=location.pathname.match(/\/Pokemon\/Products\/Singles\/([^/]+)/i)?.[1];
  if(!raw)return null;
  let slug;
  try{slug=decodeURIComponent(raw)}catch{return null}
  const key=window.CMMasterData.setKey;
  const registered=registry.sets.find(s=>s.cardmarketSlugs.some(x=>key(x)===key(slug)));
  if(registered?.source)return registered;
  const workbookName=(registered?.workbookName||slug).replace(/-/g,' ');
  const token=workbookName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(!token||token.length>100)return null;
  return {...registered,id:registered?.id||slug.replace(/-/g,' '),workbookName,
    source:{url:'https://pokecottagecdn.com/mastersets/downloads/PokeCottage-'+token+'-Master-Set-Checklist.xlsx'}};
}

const save=()=>localStorage.setItem(SETTINGS,JSON.stringify(state));
const el=(tag,props={},text='')=>{const e=document.createElement(tag);Object.assign(e,props);if(text)e.textContent=text;return e};
function loadXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);return new Promise((resolve,reject)=>{const s=el('script',{src:'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'});s.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('SheetJS no disponible'));s.onerror=()=>reject(Error('No se pudo cargar SheetJS'));document.head.append(s)})}
function updateCatalog(config){
  if(imports.has(config.id))return imports.get(config.id);
  const request=(async()=>{
    const XLSX=await loadXLSX();
    const result=await window.CMPokeCottageXLSX.fetchAndParse(XLSX,config);
    await window.CMMasterData.storeVerifiedCatalog(config.id,result.entries,{
      source:result.source,counts:result.counts,parsedAt:result.parsedAt,numberedMaster:!!config.workbookName
    });
    return result;
  })().finally(()=>imports.delete(config.id));
  imports.set(config.id,request);
  return request;
}
function supportsGrand(config){
  return config?.counts?.grand!=null;
}
function mount(){if(document.getElementById('cm-master-ui'))return;const p=el('section',{id:'cm-master-ui'});p.style='position:fixed;left:18px;bottom:70px;z-index:2147483647;width:440px;max-width:calc(100vw - 36px);max-height:78vh;overflow:auto;padding:16px;background:#fff;color:#202020;border:2px solid #333;border-radius:12px;box-shadow:0 8px 30px #0005;font:14px Arial,sans-serif';document.body.append(p);
const head=el('div');head.style='display:flex;justify-content:space-between;align-items:center';head.append(el('strong',{},'Master Sets · beta 0.5.0'),el('button',{type:'button',onclick:()=>p.remove()},'Cerrar'));p.append(head);
const context=el('div');context.style='margin:10px 0;padding:8px;background:#f1f3f5;border-radius:6px;font-size:13px';p.append(context);
const controls=el('div');controls.style='display:flex;gap:8px;margin:12px 0';const lang=el('select'),tier=el('select');[['es','Español'],['en','Inglés']].forEach(([v,t])=>lang.append(el('option',{value:v},t)));[['master','Master'],['grand','Grand Master']].forEach(([v,t])=>tier.append(el('option',{value:v},t)));lang.value=state.lang;tier.value=state.tier;controls.append(lang,tier);p.append(controls);
const actions=el('div');actions.style='display:flex;gap:6px;flex-wrap:wrap';const choose=el('button',{type:'button'},'Actualizar CSV TCGCollector'),catalog=el('button',{type:'button'},'Actualizar PokéCottage');actions.append(choose,catalog);p.append(actions);
const fileInput=el('input',{type:'file',accept:'.csv,text/csv'});fileInput.style='display:none';p.append(fileInput);
fileInput.onchange=()=>{const file=fileInput.files?.[0];if(file)action(()=>window.CMMasterData.importCollectionFile(file));fileInput.value='';};
const message=el('p');message.style='font-size:12px;color:#555';p.append(message);
const summary=el('div');summary.style='margin:10px 0;font-weight:bold';p.append(summary);
const results=el('div');results.style='max-height:260px;overflow:auto;border-top:1px solid #ddd;padding-top:8px';p.append(results);
const setMsg=s=>message.textContent=s;
let renderVersion=0;
async function render(){
  const version=++renderVersion;
  const config=detectExpansion();
  context.textContent=config?'Expansión detectada en Cardmarket: '+config.id:'Abre una expansión de Singles en Cardmarket para detectar el set';
  tier.disabled=!supportsGrand(config);
  tier.title=tier.disabled?'Solo está disponible la checklist Master para esta expansión.':'';
  tier.value=tier.disabled?'master':state.tier;
  results.replaceChildren();
  if(!config){summary.textContent='Abre una expansión de Cardmarket';return}
  const [snapshot,result]=await Promise.all([window.CMMasterData.getSnapshot(),window.CMMasterData.progress(config.id,state.lang,tier.value)]);
  if(version!==renderVersion)return;
  if(result.status!=='ok'){summary.textContent='Catálogo todavía no disponible';return}
  if(!snapshot){summary.textContent='Checklist disponible · '+result.total+' variantes';results.append(el('div',{},'Importa tu CSV de TCGCollector para ver cuáles te faltan.'));return}
  summary.textContent=result.owned+' / '+result.total+' variantes · faltan '+result.missing.length;
  const info=el('div',{},'CSV: '+snapshot.filename+' · '+snapshot.entries.length+' registros');
  info.style='font-size:12px;color:#555;margin-bottom:6px';
  results.append(info);
  for(const item of result.missing){
    const line=el('div',{},item.number+' · '+item.name+' · '+item.variant);
    line.style='padding:3px 0;border-bottom:1px solid #eee';
    results.append(line);
  }
}
async function action(fn){try{setMsg('Procesando…');const response=await fn();setMsg(typeof response==='string'?response:JSON.stringify(response));await render();}catch(e){setMsg('Error: '+e.message);console.error('Master Set Manager',e)}}
choose.onclick=()=>fileInput.click();
catalog.onclick=()=>action(async()=>{
  const config=detectExpansion();
  if(!config)throw Error('No hay checklist registrada para esta expansión');
  let result;
  try{result=await updateCatalog(config)}catch(e){await render();throw e}
  return 'Catálogo guardado: '+result.counts.master+' Master'+(supportsGrand(config)&&config.counts.grand!=null?' y '+result.counts.grand+' Grand':'');
});
lang.onchange=()=>{state.lang=lang.value;save();render()};tier.onchange=()=>{state.tier=tier.value;save();render()};
action(async()=>{
  const config=detectExpansion();
  context.textContent=config?'Expansión detectada en Cardmarket: '+config.id:'';
  const refresh=window.CMMasterData.refreshCollection().catch(e=>{console.warn('No se pudo actualizar el CSV',e);return {status:'error'}});
  if(config){
    const existing=await window.CMMasterData.getCatalog(config.id);
    if(existing?.metadata?.source!==config.source.url||
       (config.workbookName&&!existing.metadata.numberedMaster)){
      const result=await updateCatalog(config);
      await refresh;
      return 'Checklist de PokéCottage importada: '+result.counts.master+' variantes Master';
    }
  }
  return 'CSV: '+(await refresh).status;
});}
function addButton(){if(document.getElementById('cm-master-launch'))return;const b=el('button',{id:'cm-master-launch',type:'button',onclick:mount},'Master Sets');b.style='position:fixed;left:16px;bottom:16px;z-index:2147483647;background:#252a34;color:white;padding:9px 13px;border-radius:8px;border:1px solid #666;cursor:pointer';document.body.append(b)}
window.CMMasterUI={mount,updateCatalog,version:'0.5.0'};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addButton,{once:true});else addButton();
})();