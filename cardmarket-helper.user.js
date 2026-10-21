// ==UserScript==
// @name         Cardmarket Helper Loader
// @namespace    https://github.com/franktlp/cmhelper
// @version      1.1.0
// @description  Carga automaticamente la ultima version del Cardmarket Helper desde GitHub
// @author       franktlp
// @match        https://www.cardmarket.com/*/Pokemon/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async()=>{
  const RAW='https://raw.githubusercontent.com/franktlp/cmhelper/main/';
  try{
    const manifest=await fetch(RAW+'manifest.json?ts='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('manifest HTTP '+r.status);return r.json();});
    const parts=await Promise.all(manifest.parts.map(name=>fetch(RAW+name+'?v='+encodeURIComponent(manifest.version),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(name+' HTTP '+r.status);return r.text();})));
    const b64=parts.join('').replace(/\s+/g,'');
    const binary=atob(b64);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source=await new Response(stream).text();
    console.info('Cardmarket Helper loader: cargando v'+manifest.version);
    (0,eval)(source+'\n//# sourceURL=cardmarket-helper-v'+manifest.version+'.js');
  }catch(e){
    console.error('Cardmarket Helper loader error',e);
    alert('No se pudo cargar Cardmarket Helper desde GitHub: '+e.message);
  }
})();
