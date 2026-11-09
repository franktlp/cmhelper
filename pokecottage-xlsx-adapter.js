/* PokéCottage XLSX ingestion — standalone module, not enabled in production.
 * Requires XLSX (SheetJS) loaded by the caller. The official CDN file may be
 * fetched only if the origin permits CORS; errors are surfaced, not hidden.
 */
(()=>{'use strict';
const SOURCE='https://pokecottagecdn.com/mastersets/downloads/PokeCottage-MEGA-EVOLUTION-Master-Set-Checklist.xlsx';
function parseWorkbook(arrayBuffer,XLSX,options={}){
  if(!XLSX?.read||!XLSX?.utils?.sheet_to_json)throw Error('Falta la librería XLSX (SheetJS)');
  const wb=XLSX.read(arrayBuffer,{type:'array'});
  const set=options.set||'Mega Evolution';
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9#]+/g,' ');
  let candidates=[];
  for(const sheetName of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:''});
    const headerIndex=rows.findIndex(row=>{
      const h=row.map(norm);
      return h.some(v=>/^(card #|card number|number|#)$/.test(v))&&h.some(v=>/^(card name|name)$/.test(v))&&h.some(v=>/^(foil|finish|variant)$/.test(v));
    });
    if(headerIndex<0)continue;
    const header=rows[headerIndex].map(norm);
    const idx=patterns=>header.findIndex(h=>patterns.some(p=>p.test(h)));
    const numberIndex=idx([/^(card #|card number|number|#)$/]);
    const nameIndex=idx([/^(card name|name)$/]);
    const foilIndex=idx([/^(foil|finish|variant)$/]);
    const rarityIndex=idx([/^rarity$/]);
    let tier='master',entries=[];
    for(const row of rows.slice(headerIndex+1)){
      const all=row.map(clean).join(' ');
      if(/promos\s*(?:&|and)\s*variants|optional\s*promos/i.test(all)){tier='grand';continue}
      const number=clean(row[numberIndex]),name=clean(row[nameIndex]),foil=clean(row[foilIndex]),rarity=rarityIndex>=0?clean(row[rarityIndex]):'';
      if(!number||!name||!Number.isFinite(Number(number.split('/')[0]))||Number(number.split('/')[0])<1)continue;
      const language=/Brazilian Portuguese/i.test(rarity)?'pt':'all';
      const variant=tier==='master'?({'standard':'normal','normal':'normal','holo':'holo','reverse holo':'reverse'}[foil.toLowerCase()]||foil.toLowerCase()):rarity||foil;
      if(!variant)continue;
      entries.push({set,number,name,variant,tier,language,rarity,foil,detail:tier==='grand'?rarity:'',source:'pokecottage'});
    }
    if(entries.length)candidates.push({sheetName,entries});
  }
  if(!candidates.length)throw Error('No se encontró una checklist compatible: revisa la estructura del Excel');
  candidates.sort((a,b)=>b.entries.length-a.entries.length);
  const {sheetName,entries}=candidates[0];
  const master=entries.filter(x=>x.tier==='master').length,grand=entries.length;
  if(options.expectedMaster!=null&&master!==options.expectedMaster)throw Error('Catálogo Master incompleto: '+master+' filas, se esperaban '+options.expectedMaster);
  if(options.expectedGrand!=null&&grand!==options.expectedGrand)throw Error('Catálogo Grand incompleto: '+grand+' filas, se esperaban '+options.expectedGrand);
  if(!master)throw Error('La checklist no contiene entradas Master');
  return {entries,counts:{master,grand,optional:grand-master},sheetName,source:options.url||SOURCE,parsedAt:new Date().toISOString(),verified:options.expectedMaster!=null&&options.expectedGrand!=null};
}
async function fetchAndParse(XLSX){
  const bridge=window.__cmMasterFetchPokeCottage;
  if(typeof bridge!=='function')throw Error('Bridge de PokéCottage no disponible: loader beta 1.4.9 requerido');
  return parseWorkbook(await bridge(),XLSX,{set:'Mega Evolution',expectedMaster:310,expectedGrand:427,url:SOURCE})
}
window.CMPokeCottageXLSX={source:SOURCE,parseWorkbook,fetchAndParse,version:'0.2.1'};
})();