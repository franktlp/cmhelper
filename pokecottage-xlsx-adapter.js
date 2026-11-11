/* PokéCottage XLSX ingestion for Cardmarket Helper.
 * Requires SheetJS and the loader’s restricted CDN bridge.
 */
(()=>{'use strict';
const SOURCE='https://pokecottagecdn.com/mastersets/downloads/PokeCottage-MEGA-EVOLUTION-Master-Set-Checklist.xlsx';
function parseWorkbook(arrayBuffer,XLSX,options={}){
  if(!XLSX?.read||!XLSX?.utils?.sheet_to_json)throw Error('Falta la librería XLSX (SheetJS)');
  const wb=XLSX.read(arrayBuffer,{type:'array'});
  const set=options.set||'Mega Evolution';
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9#]+/g,' ');
  const dynamic=options.workbookName!=null;
  const setKey=window.CMMasterData?.setKey;
  const candidates=[];
  for(const sheetName of wb.SheetNames){
    if(dynamic&&setKey(sheetName)!==setKey(options.workbookName+' Master Set'))continue;
    const sheet=wb.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',range:0});
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
    let lastRow=rows.length;
    let selectedRows=null;
    if(dynamic){
      // The workbook's Master counter identifies the main numbered section.
      const masterColumn=header.indexOf('master set');
      const ownedColumn=header.indexOf('owned');
      if(masterColumn<0||ownedColumn<0)continue;
      const formula=sheet[XLSX.utils.encode_cell({r:headerIndex,c:masterColumn+1})]?.f;
      const ranges=[...String(formula||'').matchAll(/COUNTIF\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+),/g)];
      const owned=XLSX.utils.encode_col(ownedColumn);
      if(!ranges.length||ranges.some(r=>r[1]!==owned||r[3]!==owned))continue;
      selectedRows=new Set();
      const masterRanges=setKey(options.workbookName)==='30thcelebration'?ranges:ranges.slice(0,1);
      for(const range of masterRanges){
        const start=Number(range[2])-1,end=Number(range[4]);
        if(start<headerIndex+1||end>rows.length||start>=end)throw Error('Intervalo Master inválido en el Excel');
        for(let index=start;index<end;index++)selectedRows.add(index);
      }
      if(Math.min(...selectedRows)!==headerIndex+1)continue;
      lastRow=Math.max(...selectedRows)+1;
    }
    let tier='master',entries=[];
    for(let rowIndex=headerIndex+1;rowIndex<lastRow;rowIndex++){
      if(selectedRows&&!selectedRows.has(rowIndex))continue;
      const row=rows[rowIndex];
      const all=row.map(clean).join(' ');
      if(/promos\s*(?:&|and)\s*variants|optional\s*promos/i.test(all)){tier='grand';continue}
      const number=clean(row[numberIndex]),name=clean(row[nameIndex]),foil=clean(row[foilIndex]),rarity=rarityIndex>=0?clean(row[rarityIndex]):'';
      const numbered=Number.isFinite(Number(number.split('/')[0]))&&Number(number.split('/')[0])>=1;
      const special=dynamic&&setKey(options.workbookName)==='30thcelebration'&&
        (/^CC \d{3}\/030$/.test(number)||/^[BGR]\/RGB$/.test(number)||/^MEE \d{3}$/.test(number));
      const promo=tier==='grand'&&set==='Mega Evolution'&&/^MEP \d{3}$/.test(number);
      if(!number||!name||(!numbered&&!promo&&!special))continue;
      const language=/Brazilian Portuguese/i.test(rarity)?'pt':'all';
      const variant=tier==='master'?(window.CMMasterData?.normalizeVariant(foil)||({'standard':'normal','reverse holo':'reverse'}[foil.toLowerCase()]||foil.toLowerCase())):rarity||foil;
      if(!variant)continue;
      entries.push({set,number,name,variant,tier,language,rarity,foil,detail:tier==='grand'?rarity:'',source:'pokecottage'});
    }
    if(dynamic){
      if(entries.length!==selectedRows.size)throw Error('La sección Master del Excel contiene filas incompletas');
      if(setKey(options.workbookName)==='30thcelebration')validateCelebrationMaster(entries);
      else validateNumberedMaster(entries);
    }
    if(entries.length)candidates.push({sheetName,entries});
  }
  if(!candidates.length)throw Error('El Excel no tiene una hoja Master identificable para esta expansión');
  candidates.sort((a,b)=>b.entries.length-a.entries.length);
  const {sheetName,entries:parsed}=candidates[0];
  const entries=options.masterOnly?parsed.filter(x=>x.tier==='master'):parsed;
  if(options.set==='Destined Rivals')validateDestinedRivals(entries);
  const master=entries.filter(x=>x.tier==='master').length,grand=entries.length;
  if(options.expectedMaster!=null&&master!==options.expectedMaster)throw Error('Catálogo Master incompleto: '+master+' filas, se esperaban '+options.expectedMaster);
  if(options.expectedGrand!=null&&grand!==options.expectedGrand)throw Error('Catálogo Grand incompleto: '+grand+' filas, se esperaban '+options.expectedGrand);
  if(!master)throw Error('La checklist no contiene entradas Master');
  return {entries,counts:{master,grand,optional:grand-master},sheetName,source:options.url||SOURCE,parsedAt:new Date().toISOString(),verified:dynamic||options.expectedMaster!=null&&(options.masterOnly||options.expectedGrand!=null)};
}
function validateCelebrationMaster(entries){
  const main=entries.filter(x=>/^\d{3}\/128$/.test(x.number));
  validateNumberedMaster(main);
  const seen=new Set();
  const classic=new Set(),rgb=new Set(),energy=new Set();
  for(const entry of entries){
    if(entry.tier!=='master'||entry.variant!=='holo'||seen.has(entry.number))throw Error('Variante 30th Celebration inválida o duplicada: '+entry.number);
    seen.add(entry.number);
    const cc=/^CC (\d{3})\/030$/.exec(entry.number);
    const mee=/^MEE (\d{3})$/.exec(entry.number);
    if(cc)classic.add(Number(cc[1]));
    else if(/^[BGR]\/RGB$/.test(entry.number))rgb.add(entry.number);
    else if(mee)energy.add(Number(mee[1]));
    else if(!/^\d{3}\/128$/.test(entry.number))throw Error('Numeración 30th Celebration desconocida: '+entry.number);
  }
  if(main.length!==158||classic.size!==30||[...classic].some(n=>n<1||n>30)||rgb.size!==3||
     energy.size!==12||![2,4,5,7,9,10,11,12,13,14,15,16].every(n=>energy.has(n))){
    throw Error('Las secciones Master de 30th Celebration están incompletas');
  }
}
function validateNumberedMaster(entries){
  const groups=new Map(),denominators=new Set();
  for(const {number,name,variant,tier} of entries){
    const parts=/^(\d+)\/(\d+)$/.exec(number);
    if(!parts||tier!=='master'||!['normal','holo','reverse','poké ball','master ball'].includes(variant)){
      throw Error('Numeración o acabado Master sin verificar: '+number+' · '+variant);
    }
    const id=Number(parts[1]),denominator=Number(parts[2]);
    const group=groups.get(id)||{name,variants:new Set()};
    if(id<1||denominator<1||group.name!==name||group.variants.has(variant)){
      throw Error('Fila Master inconsistente o duplicada: '+number+' · '+variant);
    }
    group.variants.add(variant);
    groups.set(id,group);
    denominators.add(denominator);
  }
  if(denominators.size!==1||groups.size<[...denominators][0]||
      [...groups].some(([id,{variants}])=>id>groups.size||variants.has('normal')===variants.has('holo'))){
    throw Error('La checklist Master no contiene una serie completa de cartas numeradas');
  }
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
async function fetchAndParse(XLSX,{id:set,source,counts={},workbookName}){
  const bridge=window.__cmMasterFetchPokeCottage;
  if(typeof bridge!=='function')throw Error('Actualiza el loader beta de Tampermonkey');
  let bytes;
  try { bytes=await bridge(source.url); }
  catch(e){
    if(e.status===404||e.status===410)throw Error('PokéCottage no ofrece una checklist pública para '+set);
    throw e;
  }
  const signature=new Uint8Array(bytes,0,Math.min(bytes.byteLength,4));
  if(signature.length!==4||signature[0]!==80||signature[1]!==75||signature[2]!==3||signature[3]!==4){
    throw Error('PokéCottage no devolvió un archivo XLSX');
  }
  return parseWorkbook(bytes,XLSX,{
    set,workbookName,url:source.url,expectedMaster:counts.master,expectedGrand:counts.grand,
    masterOnly:counts.grand==null
  });
}
window.CMPokeCottageXLSX={source:SOURCE,parseWorkbook,fetchAndParse,version:'0.4.1'};
})();
