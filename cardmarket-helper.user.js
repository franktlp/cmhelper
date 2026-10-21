// ==UserScript==
// @name         Cardmarket Helper Loader
// @namespace    https://github.com/franktlp/cmhelper
// @version      1.3.0
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
  const RAW='https://raw.githubusercontent.com/franktlp/cmhelper/main/cardmarket-helper.js';
  try{
    const source=await fetch(RAW+'?ts='+Date.now(),{cache:'no-store'}).then(r=>{
      if(!r.ok) throw new Error('helper HTTP '+r.status);
      return r.text();
    });
    const version=(source.match(/const VERSION = \"([^\"]+)\"/)||[])[1]||'desconocida';
    console.info('Cardmarket Helper loader: cargando v'+version);
    (0,eval)(source+'\n//# sourceURL=cardmarket-helper.js');
  }catch(e){
    console.error('Cardmarket Helper loader error',e);
    alert('No se pudo cargar Cardmarket Helper desde GitHub: '+e.message);
  }
})();
