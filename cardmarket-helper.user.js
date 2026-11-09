// ==UserScript==
// @name         Cardmarket Helper Loader
// @namespace    https://github.com/franktlp/cmhelper
// @version      1.4.9-beta
// @description  Carga automaticamente la ultima version del Cardmarket Helper desde GitHub
// @author       franktlp
// @match        https://www.cardmarket.com/*/Pokemon/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      pokecottagecdn.com
// @connect      raw.githubusercontent.com
// @connect      cdn.sheetjs.com
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/franktlp/cmhelper/feature/master-set-manager/cardmarket-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/franktlp/cmhelper/feature/master-set-manager/cardmarket-helper.user.js
// ==/UserScript==

(async()=>{
  // Stable, narrow privileged bridge: page modules never receive the GM API.
  // Only the official PokéCottage checklist can be requested.
  const POKECOTTAGE_URL='https://pokecottagecdn.com/mastersets/downloads/PokeCottage-MEGA-EVOLUTION-Master-Set-Checklist.xlsx';
  const page=typeof unsafeWindow!=='undefined'?unsafeWindow:window;
  page.__cmMasterFetchPokeCottage=()=>new Promise((resolve,reject)=>{
    if(typeof GM_xmlhttpRequest!=='function'){reject(new Error('Permiso GM_xmlhttpRequest no disponible en Tampermonkey'));return}
    GM_xmlhttpRequest({
      method:'GET',url:POKECOTTAGE_URL,responseType:'arraybuffer',timeout:30000,
      onload:r=>r.status>=200&&r.status<300&&r.response?resolve(r.response):reject(new Error('PokéCottage HTTP '+r.status)),
      onerror:()=>reject(new Error('No se pudo conectar con PokéCottage')),
      ontimeout:()=>reject(new Error('PokéCottage no respondió en 30 segundos'))
    });
  });
  const BASE='https://raw.githubusercontent.com/franktlp/cmhelper/feature/master-set-manager/';
  async function load(name,label){
    const source=await fetch(BASE+name+'?ts='+Date.now(),{cache:'no-store'}).then(r=>{
      if(!r.ok) throw new Error(label+' HTTP '+r.status);
      return r.text();
    });
    (0,eval)(source+`\n//# sourceURL=${name}`);
    return source;
  }
  try{
    const source=await load('cardmarket-helper.js','helper');
    const version=(source.match(/const VERSION = \"([^\"]+)\"/)||[])[1]||'desconocida';
    console.info('Cardmarket Helper loader: cargando v'+version);
    try{
      await load('cardmarket-id-catalog.js','id-catalog');
    }catch(e){
      console.warn('Cardmarket ID Catalog no se pudo cargar',e);
    }
    try{
      await load('master-set-data-adapter.js','master data');
      await load('pokecottage-xlsx-adapter.js','PokéCottage XLSX');
      await load('master-set-ui.js','master UI');
    }catch(e){console.warn('Master Set beta no se pudo cargar',e)}
  }catch(e){
    console.error('Cardmarket Helper loader error',e);
    alert('No se pudo cargar Cardmarket Helper desde GitHub: '+e.message);
  }
})();