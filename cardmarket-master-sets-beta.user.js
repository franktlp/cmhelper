// ==UserScript==
// @name         Cardmarket Helper BETA Master Sets
// @namespace    https://github.com/franktlp/cmhelper/beta-master-sets
// @version      1.4.14-beta
// @description  Carga automaticamente la ultima version del Cardmarket Helper desde GitHub
// @author       franktlp
// @match        https://www.cardmarket.com/*/Pokemon/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      pokecottagecdn.com
// @connect      pokecottage.com
// @connect      raw.githubusercontent.com
// @connect      cdn.sheetjs.com
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/franktlp/cmhelper/feature/master-set-manager/cardmarket-master-sets-beta.user.js
// @downloadURL  https://raw.githubusercontent.com/franktlp/cmhelper/feature/master-set-manager/cardmarket-master-sets-beta.user.js
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
  page.__cmMasterFetchPublicGuide=(raw)=>new Promise((resolve,reject)=>{
    let url;
    try { url=new URL(raw); } catch { reject(Error('URL de guía inválida')); return; }
    if(url.origin!=='https://pokecottage.com'||!url.pathname.endsWith('-master-set-guide')||!url.pathname.startsWith('/')){
      reject(Error('Solo se permiten guías públicas de PokéCottage'));return;
    }
    GM_xmlhttpRequest({method:'GET',url:url.href,responseType:'text',timeout:30000,
      onload:r=>r.status>=200&&r.status<300?resolve(r.responseText):reject(Error('Guía HTTP '+r.status)),
      onerror:()=>reject(Error('No se pudo obtener la guía pública')),
      ontimeout:()=>reject(Error('La guía pública tardó demasiado'))
    });
  });
  const BASE='https://raw.githubusercontent.com/franktlp/cmhelper/feature/master-set-manager/';
  async function load(name,label){
    const PINNED={
      'master-set-ui.js':'337d5da0c5af58ef38eed6623916ac78760d4f22',
      'pokecottage-public-adapter.js':'fe3c2f1058afe28a55d62b5512a2509c3d059b51'
    };
    const url=(PINNED[name]?'https://raw.githubusercontent.com/franktlp/cmhelper/'+PINNED[name]+'/':BASE)+name+'?ts='+Date.now();
    const source=await new Promise((resolve,reject)=>GM_xmlhttpRequest({
      method:'GET',url,timeout:30000,
      headers:{'Cache-Control':'no-cache, no-store, max-age=0','Pragma':'no-cache'},
      onload:r=>r.status>=200&&r.status<300?resolve(r.responseText):reject(Error(label+' HTTP '+r.status)),
      onerror:()=>reject(Error(label+' no se pudo descargar')),
      ontimeout:()=>reject(Error(label+' tardó demasiado'))
    }));
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
      try { await load('pokecottage-xlsx-adapter.js','PokéCottage XLSX'); }
      catch(e) { console.warn('Lector XLSX no disponible; la interfaz seguirá funcionando',e); }
      try { await load('pokecottage-public-adapter.js','PokéCottage público'); }
      catch(e) { console.warn('Lector público no disponible; la interfaz seguirá funcionando',e); }
      await load('master-set-ui.js','master UI');
    }catch(e){console.warn('Master Set beta no se pudo cargar',e)}
  }catch(e){
    console.error('Cardmarket Helper loader error',e);
    alert('No se pudo cargar Cardmarket Helper desde GitHub: '+e.message);
  }
})();