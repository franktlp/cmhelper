/* Master Set Manager UI 1.5.7 — integrated with Cardmarket Helper.
 * Requires CMMasterData, CMPokeCottageXLSX and the Helper search/cart module.
 */
(()=>{'use strict';
if(window.CMMasterUI)return;
const SETTINGS='cm_master_ui_settings_v1', state=(()=>{try{return JSON.parse(localStorage.getItem(SETTINGS))||{}}catch{return {}}})();
state.lang ||= 'es';state.tier ||= 'master';
const registry=window.__cmMasterRegistry;
const imports=new Map();
function detectExpansion(){
  const path=location.pathname.includes('/Pokemon/Products/Singles/')?location.pathname:state.lastPath||'';
  const raw=path.match(/\/Pokemon\/Products\/Singles\/([^/]+)/i)?.[1];
  if(!raw)return null;
  const listPath=path.match(/^\/(?:en|es)\/Pokemon\/Products\/Singles\/[^/]+/i)?.[0];
  if(!listPath)return null;
  if(location.pathname.includes('/Pokemon/Products/Singles/')){
    state.lastPath=listPath;
    localStorage.setItem(SETTINGS,JSON.stringify(state));
  }
  let slug;
  try{slug=decodeURIComponent(raw)}catch{return null}
  const key=window.CMMasterData.setKey;
  const registered=registry.sets.find(s=>s.cardmarketSlugs.some(x=>key(x)===key(slug)));
  if(registered?.source)return {...registered,listPath};
  const workbookName=(registered?.workbookName||slug).replace(/-/g,' ');
  const token=workbookName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(!token||token.length>100)return null;
  return {...registered,listPath,id:registered?.id||slug.replace(/-/g,' '),workbookName,
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
function mount(){if(document.getElementById('cm-master-ui'))return;const p=el('section',{id:'cm-master-ui'});p.style='padding:4px 0;color:#202020;font:14px Arial,sans-serif';
document.getElementById('cm-master-host').append(p);
let searchController;
let sessionData;
let refreshShippingView;
const lifecycle=new AbortController();
const detached=new MutationObserver(()=>{
  if(!p.isConnected){searchController?.abort();lifecycle.abort();detached.disconnect()}
});
detached.observe(document.body,{childList:true,subtree:true});
const head=el('div');head.style='margin:8px 0;font-size:12px;color:#666';
head.append(el('span',{},'Master Sets · 1.5.7'));p.append(head);
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
market.style='margin-top:8px';
p.append(market);
const summary=el('div');summary.style='margin:10px 0;font-weight:bold';p.append(summary);
const results=el('div');results.style='border-top:1px solid #ddd;padding-top:8px';p.append(results);
const setMsg=s=>message.textContent=s;
let renderVersion=0;
async function render(){
  const version=++renderVersion;
  search.disabled=true;
  market.replaceChildren();
  refreshShippingView=null;
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
  const stored=await window.CMMasterData.getSearch(config.id,state.lang);
  const savedCatalog=await window.CMMasterData.getCatalog(config.id);
  if(version!==renderVersion)return;
  if(stored&&stored.scan.mappingVersion===4&&stored.inventoryUpdatedAt===snapshot.updatedAt&&stored.catalogUpdatedAt===savedCatalog.updatedAt){
    sessionData=stored;
    const response=await window.CMHelperSearchMasterOffers({
      missing:stored.scan.missing,catalog:stored.scan.catalog,language:state.lang,
      listPath:config.listPath,restore:stored.scan
    });
    if(version!==renderVersion)return;
    if(response.shippingChanged){
      stored.scan=response.snapshot();
      stored.analysis=null;
      stored.recalculate=true;
    }
    await showResponse(response,stored.scan.missing,config,stored);
  }

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
window.addEventListener('cm-helper-budget-changed',async()=>{
  const button=document.getElementById('cm-apply-budget');
  if(searchController||!p.isConnected||!refreshShippingView||button?.disabled)return;
  if(button)button.disabled=true;
  try{await refreshShippingView()}
  catch(e){setMsg('No se pudo aplicar el presupuesto: '+e.message)}
  finally{if(button)button.disabled=false}
},{signal:lifecycle.signal});
window.addEventListener('cm-helper-shipping-changed',()=>{
  if(!searchController&&p.isConnected&&refreshShippingView){
    refreshShippingView().catch(e=>setMsg('No se pudo recalcular con los portes: '+e.message));
  }
},{signal:lifecycle.signal});
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
      listPath:config.listPath,missing,catalog:saved.entries,language:state.lang,signal:searchController.signal,
      onProgress:text=>status.textContent=text
    });
    sessionData={scan:response.snapshot(),inventoryUpdatedAt:result.inventoryUpdatedAt,catalogUpdatedAt:saved.updatedAt};
    await persistSession(config);
    await showResponse(response,missing,config);
  }catch(e){status.textContent='Error: '+e.message}
  finally{
    searchController=null;
    search.textContent='Buscar faltantes en Cardmarket';
    choose.disabled=catalog.disabled=lang.disabled=false;
    tier.disabled=!supportsGrand(config);
  }
};
async function persistSession(config,data=sessionData){
  await window.CMMasterData.saveSearch(config.id,data.scan.language,
    JSON.parse(JSON.stringify(data,(key,value)=>key==='original'||typeof value==='function'?undefined:value)));
}
async function showResponse(response,missing,config,restored){
  const data=restored||sessionData;
  market.replaceChildren();
  const status=el('p');
  market.append(status);
    status.textContent=(restored?'Búsqueda guardada · '+new Date(restored.scan.createdAt||restored.savedAt).toLocaleString('es-ES')+' · ':'')+(response.stopped?response.stopped+' · ':'')+
      response.checked+'/'+missing.length+' revisadas · '+response.covered+' con oferta en presupuesto';
    market.append(el('p',{},'Primera página de ofertas por variante. Portes guardados por vendedor o estimados por el Helper.'));
    const shipping=el('button',{type:'button'},'Editar portes');
    shipping.onclick=()=>window.CMHelperEditShipping(response.shippingSellers());
    const analyze=el('button',{type:'button',disabled:!response.covered},'Análisis inteligente');
    const plan=el('div');
    market.append(analyze,shipping,plan);
    const cartStatus=el('p');
    const recoverCart=el('button',{type:'button'},'He vaciado el carrito: recuperar variantes');
    recoverCart.id='cm-master-recover-cart';
    const updateCartStatus=()=>{
      const count=response.cartProcessedCount;
      cartStatus.textContent=count?count+' variantes marcadas como añadidas al carrito anteriormente. Añadirlas no las marca como compradas.':'';
      cartStatus.hidden=recoverCart.hidden=!count;
    };
    market.insertBefore(cartStatus,plan);market.insertBefore(recoverCart,plan);
    updateCartStatus();
    recoverCart.onclick=async()=>{
      if(searchController)return;
      if(!confirm('¿Has retirado del carrito las cartas de esta colección e idioma? Volverán a incluirse en el análisis. Este botón no vacía el carrito de Cardmarket.'))return;
      recoverCart.disabled=search.disabled=analyze.disabled=shipping.disabled=true;
      try{
        await response.resetCartProgress();
        data.scan=response.snapshot();data.analysis=null;data.feedback=null;data.selectedSeller=null;
        await persistSession(config,data);
        await showResponse(response,missing,config,{...data,recalculate:true});
      }catch(e){setMsg('No se pudieron recuperar las variantes: '+e.message)}
      finally{recoverCart.disabled=search.disabled=analyze.disabled=shipping.disabled=false;updateCartStatus()}
    };

    refreshShippingView=async()=>{
      response.refreshShipping();
      data.scan=response.snapshot();
      data.analysis=null;
      await persistSession(config,data);
      await showResponse(response,missing,config,{...data,recalculate:true});
    };
    const sellerDiagnostics=new Map();
    let restoredAnalysis=restored?.analysis&&!restored.recalculate?response.restoreAnalysis(restored.analysis):null;
    analyze.onclick=async()=>{
      if(searchController)return;
      analyze.disabled=true;
      plan.textContent='Calculando el mejor reparto…';
      try{
        const analysis=restoredAnalysis||await response.analyze();
        data.recalculate=false;
        restoredAnalysis=null;
        data.analysis=analysis;
        await persistSession(config,data);
        const {best,diagnostics}=analysis;
        for(const {seller,rows} of diagnostics){
          const report=sellerDiagnostics.get(seller);
          if(!report)continue;
          const counts=new Map();
          for(const row of rows)counts.set(row.status,(counts.get(row.status)||0)+1);
          report.rows=new Map(rows.map(row=>[row.key,row]));
          report.summary.textContent='Análisis · '+[...counts].map(([reason,count])=>count+' '+reason.toLowerCase()).join(' · ');
          for(const row of rows){
            const label=report.items.get(row.key);
            if(label)label.textContent=' — '+row.status+(row.detail?' · '+row.detail:'');
          }
        }
        if(!best?.coverage){plan.textContent=analysis.processedAll?'Este plan ya está procesado para el carrito.':'El análisis no encontró un lote dentro de los límites del Helper.';return}
        plan.replaceChildren(el('p',{},best.coverage+' variantes recomendadas · '+amount(best.total)+' con portes'));
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
        sellers.onchange=()=>{
          showPack();
          data.selectedSeller=sellers.value;
          persistSession(config,data).catch(e=>setMsg('No se pudo guardar el vendedor: '+e.message));
        };
        plan.append(sellers,cart,preview,feedback);
        if(restored?.selectedSeller&&packs.has(restored.selectedSeller))sellers.value=restored.selectedSeller;
        showPack();
        if(restored?.feedback){
          const previous=restored.feedback;
          feedback.textContent='Último lote · '+previous.seller+' · '+previous.added+' añadidas · '+previous.skipped+' omitidas'+(previous.stopped?' · '+previous.stopped:'');
        }
        cart.onclick=async()=>{
          const seller=sellers.value;
          const pack=packs.get(seller);
          const total=pack.reduce((sum,o)=>sum+o.price_eur,0);
          if(!confirm('¿Añadir al carrito '+pack.length+' variantes de '+seller+' por '+amount(total)+' en cartas?'))return;
          cart.disabled=sellers.disabled=search.disabled=analyze.disabled=shipping.disabled=recoverCart.disabled=true;
          feedback.textContent='Verificando precios y añadiendo las ofertas exactas…';
          try{
            const result=await response.addPack(pack);
            if(!result.stopped)processed.add(seller);
            data.scan=response.snapshot();
            data.feedback={seller,...result};
            await persistSession(config,data);
            feedback.textContent=result.added+' añadidas · '+result.skipped+' omitidas'+
              (result.stopped?' · '+result.stopped:'')+
              (result.skipped?' · Las omitidas ya no coincidían con la oferta revisada o estaban agotadas.':'');
          }catch(e){feedback.textContent='Error: '+e.message}
          finally{sellers.disabled=search.disabled=analyze.disabled=shipping.disabled=recoverCart.disabled=false;updateCartStatus();showPack()}
        };
      }catch(e){plan.textContent='Error: '+e.message}
      finally{analyze.disabled=false}
    };
    for(const seller of response.results){
      const details=el('details');
      details.append(el('summary',{},seller.seller+' · '+seller.items.length+' variantes · '+
        amount(seller.total-seller.shipping)+' + '+amount(seller.shipping)+' = '+amount(seller.total)));
      const explanation=el('p',{},'Ejecuta el análisis inteligente para ver por qué se incluyó o descartó cada variante.');
      details.append(explanation);
      const report={summary:explanation,items:new Map(),rows:new Map()};
      sellerDiagnostics.set(seller.seller,report);
      const contents=el('div');details.append(contents);
      details.ontoggle=()=>{
        contents.replaceChildren();report.items.clear();
        if(!details.open)return;
        for(const item of seller.items){
        const line=el('div');
        line.append(el('a',{href:item.url,target:'_blank',rel:'noopener noreferrer'},
          item.number+' · '+item.name+' · '+item.variant+' · '+item.condition+' · '+amount(item.price)));
        const reason=el('span');
        line.append(reason);
        const diagnostic=report.rows.get(item.key);
        if(diagnostic)reason.textContent=' — '+diagnostic.status+(diagnostic.detail?' · '+diagnostic.detail:'');
        report.items.set(item.key,reason);
        contents.append(line);
        }
      };
      market.append(details);
    }
    if(response.issues.length){
      const details=el('details');
      details.append(el('summary',{},response.issues.length+' sin oferta verificable'));
      for(const item of response.issues)details.append(el('div',{},item.number+' · '+item.variant+' · '+item.reason));
      market.append(details);
    }
  if(restored?.analysis||restored?.recalculate)await analyze.onclick();
}
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
let showMode;
function installTabs(){
  const body=document.getElementById('cm-window-body');
  if(!body||document.getElementById('cm-helper-tabs'))return !!body;
  const wants=el('section',{id:'cm-wants-panel',role:'tabpanel'});
  while(body.firstChild)wants.append(body.firstChild);
  const nav=el('div',{id:'cm-helper-tabs',role:'tablist'});
  nav.style='display:flex;gap:8px;position:sticky;top:-15px;padding:10px 0;background:#fff;z-index:1;border-bottom:1px solid #ddd;margin-bottom:10px';
  const wantsTab=el('button',{id:'cm-wants-tab',type:'button',role:'tab'},'Wants');
  const masterTab=el('button',{id:'cm-master-tab',type:'button',role:'tab'},'Master Sets');
  wantsTab.setAttribute('aria-controls','cm-wants-panel');
  masterTab.setAttribute('aria-controls','cm-master-host');
  wants.setAttribute('aria-labelledby',wantsTab.id);
  const close=el('button',{type:'button',onclick:()=>wants.querySelector('#cm-close')?.click()},'Cerrar');
  close.style='margin-left:auto';
  nav.append(wantsTab,masterTab,close);
  const shared=el('div',{id:'cm-shared-controls'});
  shared.style='display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:8px;background:#f1f3f5;border-radius:6px;margin-bottom:10px';
  for(const id of ['cm-condition','cm-card-max-price','cm-cart-max-price','cm-default-ship']){
    const label=wants.querySelector('#'+id)?.closest('label');
    if(label)shared.append(label);
  }
  const applyBudget=el('button',{id:'cm-apply-budget',type:'button'},'Aplicar presupuesto');
  const budgetStatus=el('span',{id:'cm-budget-status','aria-live':'polite'});
  const budgetInput=shared.querySelector('#cm-cart-max-price');
  budgetInput?.addEventListener('input',()=>{budgetStatus.textContent='Presupuesto pendiente de aplicar'});
  applyBudget.onclick=()=>{
    if(budgetInput&&!budgetInput.checkValidity()){budgetInput.reportValidity();return}
    budgetStatus.textContent='';
    window.dispatchEvent(new CustomEvent('cm-helper-budget-changed'));
  };
  shared.append(applyBudget,budgetStatus);
  const settings=el('details',{id:'cm-shared-options'});
  settings.append(el('summary',{},'Países, pausas y valoración'));
  const extras=el('div');
  extras.style='display:flex;gap:10px;flex-wrap:wrap;padding:8px 0';
  const pageDelay=wants.querySelector('#cm-page-delay')?.closest('label');
  if(pageDelay)extras.append(pageDelay);
  for(const id of ['cm-country-mode','cm-premium']){
    const group=wants.querySelector('#'+id)?.closest('label')?.parentElement?.parentElement;
    if(group)extras.append(group);
  }
  settings.append(extras);
  const host=el('section',{id:'cm-master-host',role:'tabpanel',hidden:true});
  host.setAttribute('aria-labelledby',masterTab.id);
  body.append(nav,shared,settings,wants,host);
  showMode=mode=>{
    const master=mode==='master';
    state.mode=master?'master':'wants';
    save();
    wants.hidden=master;
    host.hidden=!master;
    applyBudget.hidden=budgetStatus.hidden=!master;
    for(const [tab,active] of [[wantsTab,!master],[masterTab,master]]){
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
      tab.style='padding:7px 14px;border:1px solid #23304a;border-radius:5px;cursor:pointer;background:'+(active?'#23304a;color:#fff':'#fff;color:#23304a');
    }
    if(master)mount();
  };
  wantsTab.onclick=()=>showMode('wants');
  masterTab.onclick=()=>showMode('master');
  nav.onkeydown=e=>{
    if(!['ArrowLeft','ArrowRight'].includes(e.key)||!e.target.matches('[role="tab"]'))return;
    e.preventDefault();
    const next=e.target===wantsTab?masterTab:wantsTab;
    next.click();next.focus();
  };
  document.getElementById('cm-master-launch')?.remove();
  showMode(state.mode||'wants');
  return true;
}
function activateMaster(){if(installTabs())showMode?.('master')}
window.CMMasterUI={mount:activateMaster,updateCatalog,version:'1.5.7'};
if(!installTabs()){
  const observer=new MutationObserver(()=>{
    if(installTabs())observer.disconnect();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}
})();
