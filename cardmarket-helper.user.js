// ==UserScript==
// @name         Cardmarket Helper Loader
// @namespace    https://github.com/franktlp/cmhelper
// @version      1.2.0
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
    const parts=await Promise.all(manifest.parts.map(name=>fetch(RAW+name+'?v='+encodeURIComponent(manifest.payloadVersion||manifest.version),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(name+' HTTP '+r.status);return r.text();})));
    const b64=parts.join('').replace(/\s+/g,'');
    const binary=atob(b64);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    let source=await new Response(stream).text();

    // v5.4.29 hotfix over the v5.4.28 baseline payload.
    if(manifest.version==='5.4.29'){
    source=source.replace("const VERSION = \"5.4.28 IndexedDB\";","const VERSION = \"5.4.29 DRI Product Number Fix\";");
    source=source.replace("    const cachedParsed=cached?.url ? productCodeNumberFromHref(cached.url) : null;\n    const cacheMatchesSet=cachedParsed &&\n      expansionCodesEquivalent(cachedParsed.expansion,want.expansion) &&\n      cachedParsed.number===normalizeNum(want.number);","    const cachedParsed=cached?.url ? productCodeNumberFromHref(cached.url) : null;\n    const cacheMatchesSet=cachedParsed &&\n      expansionCodesEquivalent(cachedParsed.expansion,want.expansion) &&\n      normalizeNum(cached?.number)===normalizeNum(want.number);");
    source=source.replace("        const parsedHref=productCodeNumberFromHref(href);\n        if(parsedHref){\n          if(!expansionCodesEquivalent(parsedHref.expansion,exp)) continue;\n          if(parsedHref.number!==num) continue;\n        } else {\n          const visibleRe=new RegExp(`\\\\(\\\\s*${exp.replace(/[.*+?^${}()|[\\\\]\\\\\\\\]/g,'\\\\$&')}\\\\s+0*${String(parseInt(num,10))}\\\\s*\\\\)`,`i`);\n          if(!visibleRe.test(rowText)) continue;\n        }","        const parsedHref=productCodeNumberFromHref(href);\n        const escapedExpForVisible=exp.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&');\n        const visibleRe=new RegExp(`\\\\(\\\\s*${escapedExpForVisible}\\\\s+0*${String(parseInt(num,10))}\\\\s*\\\\)`,`i`);\n        const visibleMatches=visibleRe.test(rowText);\n        if(parsedHref){\n          if(!expansionCodesEquivalent(parsedHref.expansion,exp)) continue;\n          // Cardmarket has products where the internal URL suffix is off by one\n          // from the printed card number (e.g. DRI 032 -> ...DRI031).\n          // Trust the visible (SET NNN) label when it explicitly confirms the wanted number.\n          if(parsedHref.number!==num && !visibleMatches) continue;\n        } else if(!visibleMatches) continue;");
    source=source.replace("          const suffixRe=new RegExp(`-${escapedExp}0*${String(parseInt(num,10))}$`,`i`);\n          name=slug.replace(suffixRe,\"\").replace(/-/g,\" \").trim();","          // Strip Cardmarket's internal URL suffix, which can differ from the printed number.\n          const suffixRe=new RegExp(`-${escapedExp}\\\\d{3}$`,`i`);\n          name=slug.replace(suffixRe,\"\").replace(/-/g,\" \").trim();");
    source=source.replace("          }catch(e){\n            log.textContent += `Semilla ${w.expansion} #${w.number}: ${e.message}\\n`;\n            if(/ANTIBOT/.test(String(e.message))){ stoppedByAntibot=true; break; }\n          }","          }catch(e){\n            // Do not hammer the same failed seed again in later rounds.\n            usedSeeds.add(cardKey(w));\n            markSeedUsed(w);\n            log.textContent += `Semilla ${w.expansion} #${w.number}: ${e.message}\\n`;\n            if(/ANTIBOT/.test(String(e.message))){ stoppedByAntibot=true; break; }\n          }");
    source=source.replace("    // Exact code + number first.\n    for(const a of links){\n      const p=productCodeNumberFromHref(a.getAttribute(\"href\")||\"\");\n      if(!p) continue;\n      if(canonicalExpansionCode(p.expansion)!==exp) continue;\n      if(num && p.number!==num) continue;\n      return a;\n    }","    // Exact expansion + printed number first. Cardmarket's URL suffix is not\n    // guaranteed to equal the printed card number for every product.\n    for(const a of links){\n      const p=productCodeNumberFromHref(a.getAttribute(\"href\")||\"\");\n      if(!p) continue;\n      if(canonicalExpansionCode(p.expansion)!==exp) continue;\n      if(num){\n        const rowText=(a.closest('.row, .product-row, article, li, tr, .table-body, .card')?.textContent||a.textContent||\"\").replace(/\\s+/g,\" \").trim();\n        const escaped=String(expansion||\"\").trim().replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&');\n        const visibleRe=new RegExp(`\\\\(\\\\s*${escaped}\\\\s+0*${String(parseInt(num,10))}\\\\s*\\\\)`,`i`);\n        if(p.number!==num && !visibleRe.test(rowText)) continue;\n      }\n      return a;\n    }");
    }

    console.info('Cardmarket Helper loader: cargando v'+manifest.version);
    (0,eval)(source+'\n//# sourceURL=cardmarket-helper-v'+manifest.version+'.js');
  }catch(e){
    console.error('Cardmarket Helper loader error',e);
    alert('No se pudo cargar Cardmarket Helper desde GitHub: '+e.message);
  }
})();
