// ==UserScript==
// @name         Cardmarket Helper Loader
// @namespace    https://github.com/franktlp/cmhelper
// @version      1.5.2
// @description  Cardmarket Helper con Wants, Master Sets, portes compartidos y planes persistentes
// @author       franktlp
// @match        https://www.cardmarket.com/*/Pokemon/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      pokecottagecdn.com
// @connect      raw.githubusercontent.com
// @connect      cdn.sheetjs.com
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/franktlp/cmhelper/main/cardmarket-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/franktlp/cmhelper/main/cardmarket-helper.user.js
// ==/UserScript==

(async()=>{
  // Restrict page requests to public checklist files on this CDN.
  const workbookURL=/^https:\/\/pokecottagecdn\.com\/mastersets\/downloads\/PokeCottage-[A-Z0-9]+(?:-[A-Z0-9]+)*-Master-Set-Checklist\.xlsx$/;
  const page=typeof unsafeWindow!=='undefined'?unsafeWindow:window;
  if(page.__cmHelperLoaderActive)return;
  page.__cmHelperLoaderActive='1.5.2';
  page.__cmMasterFetchPokeCottage=url=>new Promise((resolve,reject)=>{
    if(typeof GM_xmlhttpRequest!=='function'){reject(new Error('Permiso GM_xmlhttpRequest no disponible en Tampermonkey'));return}
    if(typeof url!=='string'||url.length>220||!workbookURL.test(url)){reject(new Error('Checklist de PokéCottage no autorizada'));return}
    GM_xmlhttpRequest({
      method:'GET',url,anonymous:true,responseType:'arraybuffer',timeout:30000,
      onload:r=>{
        if(r.finalUrl&&r.finalUrl!==url){reject(Error('PokéCottage redirigió la descarga a otra URL'));return}
        if(r.status>=200&&r.status<300&&r.response){resolve(r.response);return}
        const error=Error('PokéCottage HTTP '+r.status);
        error.status=r.status;
        reject(error);
      },
      onerror:()=>reject(new Error('No se pudo conectar con PokéCottage')),
      ontimeout:()=>reject(new Error('PokéCottage no respondió en 30 segundos'))
    });
  });
  const BASE='https://raw.githubusercontent.com/franktlp/cmhelper/main/';
  // Load all modules from the same verified release.
  const RELEASE='5bfc92535b7c68281a4d4d65f89c324a54d5c719';
  const PINNED={
    'cardmarket-helper.js':RELEASE,
    'cardmarket-id-catalog.js':RELEASE,
    'master-set-data-adapter.js':RELEASE,
    'master-set-registry.json':RELEASE,
    'master-set-ui.js':RELEASE,
    'pokecottage-xlsx-adapter.js':RELEASE
  };
  async function load(name,label){
    const url=(PINNED[name]?'https://raw.githubusercontent.com/franktlp/cmhelper/'+PINNED[name]+'/':BASE)+name+'?ts='+Date.now();
    const source=await new Promise((resolve,reject)=>GM_xmlhttpRequest({
      method:'GET',url,timeout:30000,
      headers:{'Cache-Control':'no-cache, no-store, max-age=0','Pragma':'no-cache'},
      onload:r=>r.status>=200&&r.status<300?resolve(r.responseText):reject(Error(label+' HTTP '+r.status)),
      onerror:()=>reject(Error(label+' no se pudo descargar')),
      ontimeout:()=>reject(Error(label+' tardó demasiado'))
    }));
    if(name.endsWith('.json'))return JSON.parse(source);
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
      const registry=await load('master-set-registry.json','master registry');
      if(!Array.isArray(registry.sets))throw Error('Registro de Master Sets inválido');
      page.__cmMasterRegistry=registry;
      try { await load('pokecottage-xlsx-adapter.js','PokéCottage XLSX'); }
      catch(e) { console.warn('Lector XLSX no disponible; la interfaz seguirá funcionando',e); }
      await load('master-set-ui.js','master UI');
    }catch(e){console.warn('Master Sets no se pudo cargar',e)}
  }catch(e){
    console.error('Cardmarket Helper loader error',e);
    alert('No se pudo cargar Cardmarket Helper desde GitHub: '+e.message);
  }
})();