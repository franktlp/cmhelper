/* Master Set Manager UI beta 0.4.0 — loaded only by feature branch loader.
 * Requires CMMasterData and CMPokeCottageXLSX. No Cardmarket purchase actions.
 */
(()=>{'use strict';
if(window.CMMasterUI)return;
const SETTINGS='cm_master_ui_settings_v1', state=(()=>{try{return JSON.parse(localStorage.getItem(SETTINGS))||{}}catch{return {}}})();
state.lang ||= 'es';state.tier ||= 'master';state.set ||= 'Mega Evolution';
const registry=window.__cmMasterRegistry;
const imports=new Map();
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
function detectExpansion(){let slug='';try{const match=decodeURIComponent(location.pathname).match(/\/Pokemon\/Products\/Singles\/([^/?#]+)/i);slug=match?.[1]||''}catch{}if(!slug)return null;const match=registry.sets.find(s=>(s.cardmarketSlugs||[]).some(x=>norm(x)===norm(slug)));return {name:slug.replace(/-/g,' '),config:match}}

const save=()=>localStorage.setItem(SETTINGS,JSON.stringify(state));
const el=(tag,props={},text='')=>{const e=document.createElement(tag);Object.assign(e,props);if(text)e.textContent=text;return e};
function loadXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);return new Promise((resolve,reject)=>{const s=el('script',{src:'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'});s.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('SheetJS no disponible'));s.onerror=()=>reject(Error('No se pudo cargar SheetJS'));document.head.append(s)})}
async function inspectPublicGuide(config){
  if(!config?.source?.page)throw Error('No hay guía pública registrada');
  if(typeof window.__cmMasterFetchPublicGuide!=='function')throw Error('Actualiza el loader beta de Tampermonkey para habilitar guías públicas');
  if(!window.CMPokeCottagePublic?.parseHTML)throw Error('Lector de tablas públicas no cargado');
  const html=await window.__cmMasterFetchPublicGuide(config.source.page);
  let result;
  try { result=window.CMPokeCottagePublic.parseHTML(html,{set:config.id,url:config.source.page,expectedMaster:config.counts.master}); }
  catch(e) {
    const doc=new DOMParser().parseFromString(html,'text/html');
    const links=[...doc.querySelectorAll('a[href]')].filter(a=>/xlsx|checklist|download/i.test(a.href)).map(a=>a.getAttribute('href')).slice(0,5);
    const components=[...doc.querySelectorAll('[data-block-type],[data-controller],[data-item-id]')];
    const types={};for(const n of components){const k=n.getAttribute('data-block-type')||n.getAttribute('data-controller')||'item';types[k]=(types[k]||0)+1;}
    const scripts=[...doc.querySelectorAll('script')].filter(s=>/checklist|cardlist|card-list|variants|squarespace/i.test(s.textContent)).length;
    const details='[lector '+(window.CMPokeCottagePublic.version||'sin versión')+', bloques '+components.length+', tipos '+JSON.stringify(types).slice(0,220)+', scripts relevantes '+scripts+', enlaces '+JSON.stringify(links).slice(0,280)+', HTML '+html.length+']';
    throw Error(e.message+' '+details);
  }
  await window.CMMasterData.storeVerifiedCatalog(config.id,result.entries,{source:result.source,counts:result.counts,parsedAt:result.parsedAt});
  return result;
}
function updateCatalog(config){
  if(imports.has(config.id))return imports.get(config.id);
  const request=(async()=>{
    const XLSX=await loadXLSX();
    const result=await window.CMPokeCottageXLSX.fetchAndParse(XLSX,config);
    await window.CMMasterData.storeVerifiedCatalog(config.id,result.entries,{
      source:result.source,counts:result.counts,parsedAt:result.parsedAt
    });
    return result;
  })().finally(()=>imports.delete(config.id));
  imports.set(config.id,request);
  return request;
}
function supportsGrand(config){
  return config?.source.kind!=='pokecottage-xlsx'||config.counts.grand!=null;
}
function mount(){if(document.getElementById('cm-master-ui'))return;const p=el('section',{id:'cm-master-ui'});p.style='position:fixed;left:18px;bottom:70px;z-index:2147483647;width:440px;max-width:calc(100vw - 36px);max-height:78vh;overflow:auto;padding:16px;background:#fff;color:#202020;border:2px solid #333;border-radius:12px;box-shadow:0 8px 30px #0005;font:14px Arial,sans-serif';document.body.append(p);
const head=el('div');head.style='display:flex;justify-content:space-between;align-items:center';head.append(el('strong',{},'Master Sets · beta 0.4.0'),el('button',{type:'button',onclick:()=>p.remove()},'Cerrar'));p.append(head);
const context=el('div');context.style='margin:10px 0;padding:8px;background:#f1f3f5;border-radius:6px;font-size:13px';p.append(context);
const controls=el('div');controls.style='display:flex;gap:8px;margin:12px 0';const lang=el('select'),tier=el('select');[['es','Español'],['en','Inglés']].forEach(([v,t])=>lang.append(el('option',{value:v},t)));[['master','Master'],['grand','Grand Master']].forEach(([v,t])=>tier.append(el('option',{value:v},t)));lang.value=state.lang;tier.value=state.tier;controls.append(lang,tier);p.append(controls);
const actions=el('div');actions.style='display:flex;gap:6px;flex-wrap:wrap';const choose=el('button',{type:'button'},'Actualizar CSV TCGCollector'),catalog=el('button',{type:'button'},'Actualizar PokéCottage');actions.append(choose,catalog);p.append(actions);
const fileInput=el('input',{type:'file',accept:'.csv,text/csv'});fileInput.style='display:none';p.append(fileInput);
fileInput.onchange=()=>{const file=fileInput.files?.[0];if(file)action(()=>window.CMMasterData.importCollectionFile(file));fileInput.value='';};
const message=el('p');message.style='font-size:12px;color:#555';p.append(message);
const summary=el('div');summary.style='margin:10px 0;font-weight:bold';p.append(summary);
const results=el('div');results.style='max-height:260px;overflow:auto;border-top:1px solid #ddd;padding-top:8px';p.append(results);
const setMsg=s=>message.textContent=s;
async function render(){const detected=detectExpansion();context.textContent=detected?'Expansión detectada en Cardmarket: '+detected.name:'Abre una expansión de Singles en Cardmarket para detectar el set';if(!detected){summary.textContent='Abre una expansión de Cardmarket';results.replaceChildren();return}
const config=detected.config;tier.disabled=!supportsGrand(config);tier.title=tier.disabled?'Solo está disponible la checklist Master para esta expansión.':'';tier.value=tier.disabled?'master':state.tier;
if(!config){summary.textContent='Checklist pendiente: '+detected.name;results.replaceChildren();setMsg('Esta expansión aún no tiene un enlace PokéCottage verificado en el registro. No se mostrará el progreso de otra colección.');return}
if(config.status!=='verified'){const existing=await window.CMMasterData.progress(config.id,state.lang,tier.value);if(existing.status!=='ok'){summary.textContent='Checklist identificada: '+config.id;results.replaceChildren();setMsg('Pulsa Actualizar PokéCottage para comprobar si la tabla pública permite importar todas las variantes.');return}}
state.set=config.id;const snapshot=await window.CMMasterData.getSnapshot();const result=await window.CMMasterData.progress(state.set,state.lang,tier.value);results.replaceChildren();if(result.status!=='ok'){summary.textContent='Catálogo todavía no disponible';setMsg('Pulsa Actualizar PokéCottage para descargar la checklist original.');return}summary.textContent=result.owned+' / '+result.total+' variantes · faltan '+result.missing.length;const info=el('div',{},'CSV: '+(snapshot?.filename||'no seleccionado')+' · '+(snapshot?.entries?.length||0)+' registros');info.style='font-size:12px;color:#555;margin-bottom:6px';results.append(info);for(const item of result.missing.slice(0,120)){const line=el('div',{},item.number+' · '+item.name+' · '+item.variant);line.style='padding:3px 0;border-bottom:1px solid #eee';results.append(line)}if(result.missing.length>120)results.append(el('p',{},'Mostrando las primeras 120 faltantes.'))}
async function action(fn){try{setMsg('Procesando…');const response=await fn();setMsg(typeof response==='string'?response:JSON.stringify(response));await render();}catch(e){setMsg('Error: '+e.message);console.error('Master Set Manager',e)}}
choose.onclick=()=>fileInput.click();
catalog.onclick=()=>action(async()=>{
  const config=detectExpansion()?.config;
  if(!config)throw Error('No hay checklist registrada para esta expansión');
  const result=config.source.kind==='pokecottage-xlsx'?await updateCatalog(config):await inspectPublicGuide(config);
  return 'Catálogo guardado: '+result.counts.master+' Master'+(supportsGrand(config)&&config.counts.grand!=null?' y '+result.counts.grand+' Grand':'');
});
lang.onchange=()=>{state.lang=lang.value;save();render()};tier.onchange=()=>{state.tier=tier.value;save();render()};
action(async()=>{
  const config=detectExpansion()?.config;
  const refresh=window.CMMasterData.refreshCollection().catch(e=>{console.warn('No se pudo actualizar el CSV',e);return {status:'error'}});
  if(config?.id==='Destined Rivals'){
    const existing=await window.CMMasterData.getCatalog(config.id);
    if(existing?.metadata?.source!==config.source.url||existing?.entries?.length!==config.counts.master){
      try {
        const result=await updateCatalog(config);
        await refresh;
        return 'Checklist de PokéCottage importada: '+result.counts.master+' variantes Master';
      } catch(e) {
        await render();
        throw e;
      }
    }
  }
  return 'CSV: '+(await refresh).status;
});}
function addButton(){if(document.getElementById('cm-master-launch'))return;const b=el('button',{id:'cm-master-launch',type:'button',onclick:mount},'Master Sets');b.style='position:fixed;left:16px;bottom:16px;z-index:2147483647;background:#252a34;color:white;padding:9px 13px;border-radius:8px;border:1px solid #666;cursor:pointer';document.body.append(b)}
window.CMMasterUI={mount,updateCatalog,version:'0.4.0'};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addButton,{once:true});else addButton();
})();