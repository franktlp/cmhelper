/* PokéCottage XLSX ingestion — standalone module, not enabled in production.
 * Requires SheetJS and the beta loader’s restricted CDN bridge.
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
      const numbered=Number.isFinite(Number(number.split('/')[0]))&&Number(number.split('/')[0])>=1;
      const promo=tier==='grand'&&set==='Mega Evolution'&&/^MEP \d{3}$/.test(number);
      if(!number||!name||(!numbered&&!promo))continue;
      const language=/Brazilian Portuguese/i.test(rarity)?'pt':'all';
      const variant=tier==='master'?({'standard':'normal','normal':'normal','holo':'holo','reverse holo':'reverse'}[foil.toLowerCase()]||foil.toLowerCase()):rarity||foil;
      if(!variant)continue;
      entries.push({set,number,name,variant,tier,language,rarity,foil,detail:tier==='grand'?rarity:'',source:'pokecottage'});
    }
    if(entries.length)candidates.push({sheetName,entries});
  }
  if(!candidates.length)throw Error('No se encontró una checklist compatible: revisa la estructura del Excel');
  candidates.sort((a,b)=>b.entries.length-a.entries.length);
  const {sheetName,entries:parsed}=candidates[0];
  const entries=options.masterOnly?parsed.filter(x=>x.tier==='master'):parsed;
  if(options.set==='Destined Rivals')validateDestinedRivals(entries);
  const master=entries.filter(x=>x.tier==='master').length,grand=entries.length;
  if(options.expectedMaster!=null&&master!==options.expectedMaster)throw Error('Catálogo Master incompleto: '+master+' filas, se esperaban '+options.expectedMaster);
  if(options.expectedGrand!=null&&grand!==options.expectedGrand)throw Error('Catálogo Grand incompleto: '+grand+' filas, se esperaban '+options.expectedGrand);
  if(!master)throw Error('La checklist no contiene entradas Master');
  return {entries,counts:{master,grand,optional:grand-master},sheetName,source:options.url||SOURCE,parsedAt:new Date().toISOString(),verified:options.expectedMaster!=null&&(options.masterOnly||options.expectedGrand!=null)};
}
function validateDestinedRivals(entries){
  const variantsByNumber=new Map();
  for(const {number,variant} of entries){
    const id=/^(\d{3})\/182$/.exec(number)?.[1];
    const variants=variantsByNumber.get(id)||new Set();
    if(!id||Number(id)<1||Number(id)>244||!['normal','holo','reverse'].includes(variant)||variants.has(variant)){
      throw Error('Variante inválida o duplicada de Destined Rivals: '+number+' · '+variant);
    }
    variants.add(variant);
    variantsByNumber.set(id,variants);
  }
  const counts={normal:0,holo:0,reverse:0};
  for(const [id,variants] of variantsByNumber){
    if(Number(variants.has('normal'))+Number(variants.has('holo'))!==1||
       (Number(id)>182&&(!variants.has('holo')||variants.has('reverse')))){
      throw Error('Acabados incompatibles en Destined Rivals: '+id);
    }
    for(const variant of variants)counts[variant]++;
  }
  if(variantsByNumber.size!==244||counts.normal!==147||counts.holo!==97||counts.reverse!==165){
    throw Error('El desglose de Destined Rivals no coincide con las 244 cartas y 165 reverse holo');
  }
}
async function fetchAndParse(XLSX,{id:set,source,counts}){
  const bridge=window.__cmMasterFetchPokeCottage;
  if(typeof bridge!=='function')throw Error('Actualiza el loader beta de Tampermonkey');
  return parseWorkbook(await bridge(source.url),XLSX,{
    set,url:source.url,expectedMaster:counts.master,expectedGrand:counts.grand,
    masterOnly:counts.grand==null
  });
}
window.CMPokeCottageXLSX={source:SOURCE,parseWorkbook,fetchAndParse,version:'0.3.0'};
})();
