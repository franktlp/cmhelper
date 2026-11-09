/* Master Set Manager UI beta 0.7.0 — loaded only by feature branch loader.
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
let searchController;
const head=el('div');head.style='display:flex;justify-content:space-between;align-items:center';head.append(el('strong',{},'Master Sets · beta 0.7.0'),el('button',{type:'button',onclick:()=>{searchController?.abort();p.remove()}},'Cerrar'));p.append(head);
const context=el('div');context.style='margin:10px 0;padding:8px;background:#f1f3f5;border-radius:6px;font-size:13px';p.append(context);
const controls=el('div');controls.style='display:flex;gap:8px;margin:12px 0';const lang=el('select'),tier=el('select');[['es','Español'],['en','Inglés']].forEach(([v,t])=>lang.append(el('option',{value:v},t)));[['master','Master'],['grand','Grand Master']].forEach(([v,t])=>tier.append(el('option',{value:v},t)));lang.value=state.lang;tier.value=state.tier;controls.append(lang,tier);p.append(controls);
const actions=el('div');actions.style='display:flex;gap:6px;flex-wrap:wrap';const choose=el('button',{type:'button'},'Actualizar CSV TCGCollector'),catalog=el('button',{type:'button'},'Actualizar PokéCottage');const search=el('button',{type:'button',disabled:true},'Buscar faltantes en Cardmarket');actions.append(choose,catalog,search);p.append(actions);
const fileInput=el('input',{type:'file',accept:'.csv,text/csv'});fileInput.style='display:none';p.append(fileInput);
fileInput.onchange=()=>{const file=fileInput.files?.[0];if(file)action(async()=>{
  const result=await window.CMMasterData.importCollectionFile(file);
  return 'CSV importado · '+result.entries+' registros';
});fileInput.value='';};
const message=el('p');message.style='font-size:12px;color:#555';p.append(message);
const market=el('section');
market.style='max-height:240px;overflow:auto;margin-top:8px';
p.append(market);
const summary=el('div');summary.style='margin:10px 0;font-weight:bold';p.append(summary);
const results=el('div');results.style='max-height:260px;overflow:auto;border-top:1px solid #ddd;padding-top:8px';p.append(results);
const setMsg=s=>message.textContent=s;
let renderVersion=0;
async function render(){
  const version=++renderVersion;
  search.disabled=true;
  market.replaceChildren();
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
  search.disabled=!result.missing.some(item=>item.tier==='master');
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
async function action(fn){try{search.disabled=true;setMsg('Procesando…');const response=await fn();setMsg(typeof response==='string'?response:JSON.stringify(response));await render();}catch(e){setMsg('Error: '+e.message);console.error('Master Set Manager',e)}}
const amount=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
search.onclick=async()=>{
  if(searchController){searchController.abort();return}
  const config=detectExpansion();
  if(!config||!window.CMHelperSearchMasterOffers){setMsg('El buscador del Helper no está disponible.');return}
  searchController=new AbortController();
  search.textContent='Detener búsqueda';
  choose.disabled=catalog.disabled=lang.disabled=tier.disabled=true;
  market.replaceChildren();
  const status=el('p',{},'Preparando faltantes…');
  market.append(status);
  try{
    const [saved,result]=await Promise.all([
      window.CMMasterData.getCatalog(config.id),
      window.CMMasterData.progress(config.id,state.lang,'master')
    ]);
    const missing=result.missing||[];
    const response=await window.CMHelperSearchMasterOffers({
      missing,catalog:saved.entries,language:state.lang,signal:searchController.signal,
      onProgress:text=>status.textContent=text
    });
    status.textContent=(response.stopped?response.stopped+' · ':'')+
      response.checked+'/'+missing.length+' revisadas · '+response.covered+' con oferta en presupuesto';
    market.append(el('p',{},'Primera página de ofertas por variante. Portes estimados según el Helper. El presupuesto se aplica por vendedor.'));
    const analyze=el('button',{type:'button',disabled:!response.covered},'Análisis inteligente');
    const plan=el('div');
    market.append(analyze,plan);
    analyze.onclick=async()=>{
      if(searchController)return;
      analyze.disabled=true;
      plan.textContent='Calculando el mejor reparto…';
      try{
        const {best}=await response.analyze();
        if(!best?.coverage){plan.textContent='El análisis no encontró un lote dentro de los límites del Helper.';return}
        plan.replaceChildren(el('p',{},best.coverage+' variantes recomendadas · '+amount(best.total)+' con portes estimados'));
        const sellers=el('select');
        sellers.setAttribute('aria-label','Vendedor del plan');
        const packs=new Map();
        for(const offer of Object.values(best.selected)){
          if(!packs.has(offer.seller))packs.set(offer.seller,[]);
          packs.get(offer.seller).push(offer);
        }
        for(const [seller,pack] of packs)sellers.append(el('option',{value:seller},seller+' · '+pack.length+' variantes'));
        const cart=el('button',{type:'button'},'Añadir lote al carrito');
        const feedback=el('p');
        const preview=el('details');
        const processed=new Set();
        const showPack=()=>{
          const pack=packs.get(sellers.value);
          cart.disabled=processed.has(sellers.value);
          preview.replaceChildren(el('summary',{},'Ver cartas del vendedor'));
          for(const o of pack)preview.append(el('div',{},o.number+' · '+o.name+' · '+o.variant+' · '+amount(o.price_eur)));
        };
        sellers.onchange=showPack;
        plan.append(sellers,cart,preview,feedback);
        showPack();
        cart.onclick=async()=>{
          const seller=sellers.value;
          const pack=packs.get(seller);
          const total=pack.reduce((sum,o)=>sum+o.price_eur,0);
          if(!confirm('¿Añadir al carrito '+pack.length+' variantes de '+seller+' por '+amount(total)+' en cartas?'))return;
          cart.disabled=sellers.disabled=search.disabled=analyze.disabled=true;
          feedback.textContent='Verificando precios y añadiendo las ofertas exactas…';
          try{
            const result=await response.addPack(pack);
            processed.add(seller);
            feedback.textContent=result.added+' añadidas · '+result.skipped+' omitidas'+
              (result.stopped?' · '+result.stopped:'')+
              (result.skipped?' · Las omitidas ya no coincidían con la oferta revisada o estaban agotadas.':'');
          }catch(e){feedback.textContent='Error: '+e.message}
          finally{sellers.disabled=search.disabled=analyze.disabled=false;showPack()}
        };
      }catch(e){plan.textContent='Error: '+e.message}
      finally{analyze.disabled=false}
    };
    for(const seller of response.results){
      const details=el('details');
      details.append(el('summary',{},seller.seller+' · '+seller.items.length+' variantes · '+
        amount(seller.total-seller.shipping)+' + '+amount(seller.shipping)+' = '+amount(seller.total)));
      for(const item of seller.items){
        const line=el('div');
        line.append(el('a',{href:item.url,target:'_blank',rel:'noopener noreferrer'},
          item.number+' · '+item.name+' · '+item.variant+' · '+item.condition+' · '+amount(item.price)));
        details.append(line);
      }
      market.append(details);
    }
    if(response.issues.length){
      const details=el('details');
      details.append(el('summary',{},response.issues.length+' sin oferta verificable'));
      for(const item of response.issues)details.append(el('div',{},item.number+' · '+item.variant+' · '+item.reason));
      market.append(details);
    }
  }catch(e){status.textContent='Error: '+e.message}
  finally{
    searchController=null;
    search.textContent='Buscar faltantes en Cardmarket';
    choose.disabled=catalog.disabled=lang.disabled=false;
    tier.disabled=!supportsGrand(config);
  }
};
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
window.CMMasterUI={mount,updateCatalog,version:'0.7.0'};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addButton,{once:true});else addButton();
})();