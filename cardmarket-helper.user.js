// ==UserScript==
// @name         Cardmarket Helper Loader
// @namespace    https://github.com/franktlp/cmhelper
// @version      1.4.7-beta
// @description  Carga automaticamente la ultima version del Cardmarket Helper desde GitHub
// @author       franktlp
// @match        https://www.cardmarket.com/*/Pokemon/*
// @grant        none
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/franktlp/cmhelper/main/cardmarket-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/franktlp/cmhelper/main/cardmarket-helper.user.js
// ==/UserScript==

(async()=>{
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