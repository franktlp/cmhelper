/* Master Set Manager UI beta 0.3.0 — loaded only by feature branch loader.
 * Requires CMMasterData and CMPokeCottageXLSX. No Cardmarket purchase actions.
 */
(()=>{'use strict';
if(window.CMMasterUI)return;
const SETTINGS='cm_master_ui_settings_v1', state=(()=>{try{return JSON.parse(localStorage.getItem(SETTINGS))||{}}catch{return {}}})();
state.lang ||= 'es';state.tier ||= 'master';state.set ||= 'Mega Evolution';
const save=()=>localStorage.setItem(SETTINGS,JSON.stringify(state));
const el=(tag,props={},text='')=>{const e=document.createElement(tag);Object.assign(e,props);if(text)e.textContent=text;return e};
function loadXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);return new Promise((resolve,reject)=>{const s=el('script',{src:'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'});s.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('SheetJS no disponible'));s.onerror=()=>reject(Error('No se pudo cargar SheetJS'));document.head.append(s)})}
async function updateCatalog(){const XLSX=await loadXLSX();const result=await window.CMPokeCottageXLSX.fetchAndParse(XLSX);await window.CMMasterData.storeVerifiedCatalog('Mega Evolution',result.entries,{source:result.source,counts:result.counts,parsedAt:result.parsedAt});return result}
function mount(){if(document.getElementById('cm-master-ui'))return;const p=el('section',{id:'cm-master-ui'});p.style='position:fixed;right:18px;bottom:70px;z-index:2147483647;width:440px;max-width:calc(100vw - 36px);max-height:78vh;overflow:auto;padding:16px;background:#fff;color:#202020;border:2px solid #333;border-radius:12px;box-shadow:0 8px 30px #0005;font:14px Arial,sans-serif';document.body.append(p);
const head=el('div');head.style='display:flex;justify-content:space-between;align-items:center';head.append(el('strong',{},'Master Sets · beta'),el('button',{type:'button',onclick:()=>p.remove()},'Cerrar'));p.append(head);
const controls=el('div');controls.style='display:flex;gap:8px;margin:12px 0';const lang=el('select'),tier=el('select');[['es','Español'],['en','Inglés']].forEach(([v,t])=>lang.append(el('option',{value:v},t)));[['master','Master'],['grand','Grand Master']].forEach(([v,t])=>tier.append(el('option',{value:v},t)));lang.value=state.lang;tier.value=state.tier;controls.append(lang,tier);p.append(controls);
const actions=el('div');actions.style='display:flex;gap:6px;flex-wrap:wrap';const choose=el('button',{type:'button'},'Elegir CSV local'),refresh=el('button',{type:'button'},'Releer CSV'),permission=el('button',{type:'button'},'Autorizar CSV'),catalog=el('button',{type:'button'},'Actualizar PokéCottage');actions.append(choose,refresh,permission,catalog);p.append(actions);
const fileInput=el('input',{type:'file',accept:'.csv,text/csv'});fileInput.style='display:none';p.append(fileInput);
fileInput.onchange=()=>{const file=fileInput.files?.[0];if(file)action(()=>window.CMMasterData.importCollectionFile(file));fileInput.value='';};
const message=el('p');message.style='font-size:12px;color:#555';p.append(message);
const summary=el('div');summary.style='margin:10px 0;font-weight:bold';p.append(summary);
const results=el('div');results.style='max-height:260px;overflow:auto;border-top:1px solid #ddd;padding-top:8px';p.append(results);
const setMsg=s=>message.textContent=s;
async function render(){const snapshot=await window.CMMasterData.getSnapshot();const result=await window.CMMasterData.progress(state.set,state.lang,state.tier);results.replaceChildren();if(result.status!=='ok'){summary.textContent='Catálogo todavía no disponible';setMsg('Pulsa Actualizar PokéCottage para descargar la checklist original.');return}summary.textContent=result.owned+' / '+result.total+' variantes · faltan '+result.missing.length;const info=el('div',{},'CSV: '+(snapshot?.filename||'no seleccionado')+' · '+(snapshot?.entries?.length||0)+' registros');info.style='font-size:12px;color:#555;margin-bottom:6px';results.append(info);for(const item of result.missing.slice(0,120)){const line=el('div',{},item.number+' · '+item.name+' · '+item.variant);line.style='padding:3px 0;border-bottom:1px solid #eee';results.append(line)}if(result.missing.length>120)results.append(el('p',{},'Mostrando las primeras 120 faltantes.'))}
async function action(fn){try{setMsg('Procesando…');const response=await fn();setMsg(typeof response==='string'?response:JSON.stringify(response));await render();}catch(e){setMsg('Error: '+e.message);console.error('Master Set Manager',e)}}
choose.onclick=()=>{
  if(typeof window.showOpenFilePicker!=='function'){fileInput.click();return}
  action(async()=>{
    try{return await window.CMMasterData.chooseCollectionFile()}
    catch(e){if(e?.name==='AbortError')return 'Selección cancelada';if(e?.name==='SecurityError'||e?.name==='NotAllowedError'){fileInput.click();return 'Selecciona el CSV con el diálogo estándar'}throw e}
  });
};
refresh.onclick=()=>action(()=>window.CMMasterData.refreshCollection());
permission.onclick=()=>action(()=>window.CMMasterData.requestCollectionPermission());
catalog.onclick=()=>action(async()=>{const result=await updateCatalog();return 'Catálogo guardado: '+result.counts.master+' Master y '+result.counts.grand+' Grand';});
lang.onchange=()=>{state.lang=lang.value;save();render()};tier.onchange=()=>{state.tier=tier.value;save();render()};
action(async()=>{const r=await window.CMMasterData.refreshCollection();return 'CSV: '+r.status});}
function addButton(){if(document.getElementById('cm-master-launch'))return;const b=el('button',{id:'cm-master-launch',type:'button',onclick:mount},'Master Sets');b.style='position:fixed;right:16px;bottom:16px;z-index:2147483646;background:#252a34;color:white;padding:9px 13px;border-radius:8px;border:1px solid #666;cursor:pointer';document.body.append(b)}
window.CMMasterUI={mount,updateCatalog,version:'0.3.0'};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addButton,{once:true});else addButton();
})();