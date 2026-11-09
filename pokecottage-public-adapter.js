/* Parse public PokéCottage checklist tables without submitting forms. */
(()=>{'use strict';
if(window.CMPokeCottagePublic)return;
const norm=s=>String(s??'').trim().toLowerCase().replace(/\s+/g,' ');
function parseHTML(html,options={}){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const set=options.set||'Destined Rivals',entries=[],seen=new Set();
  for(const table of doc.querySelectorAll('table')){
    const headings=[...table.querySelectorAll('thead th')].map(e=>norm(e.textContent));
    const first=table.querySelector('tr');
    const columns=headings.length?headings:[...(first?.querySelectorAll('th,td')||[])].map(e=>norm(e.textContent));
    const index=patterns=>columns.findIndex(c=>patterns.some(p=>p.test(c)));
    const num=index([/^number$/,/^card #$/,/^card number$/]),name=index([/^card name$/,/^name$/]),foil=index([/^foil$/,/^finish$/,/^variant$/]),rarity=index([/^rarity$/]);
    if(num<0||name<0||foil<0)continue;
    for(const tr of table.querySelectorAll('tbody tr')){
      const cells=[...tr.querySelectorAll('td')].map(e=>e.textContent.trim());
      const number=String(cells[num]||'').match(/^0*(\d{1,4})(?:\/\d{1,4})?$/)?.[1];
      const cardName=cells[name]?.trim(),finish=norm(cells[foil]),rare=cells[rarity]?.trim()||'';
      const variant=({'standard':'normal','normal':'normal','holo':'holo','reverse holo':'reverse','reverse':'reverse'})[finish];
      if(!number||!cardName||!variant)continue;
      const key=number+':'+variant;
      if(seen.has(key))continue;
      seen.add(key);
      entries.push({set,number,name:cardName,variant,tier:'master',language:'all',rarity:rare,foil:cells[foil],source:'pokecottage-public'});
    }
  }
  const expected=options.expectedMaster;
  if(expected!=null&&entries.length!==expected){
    const tables=doc.querySelectorAll('table').length;
    const rows=doc.querySelectorAll('table tr').length;
    const scripts=doc.querySelectorAll('script').length;
    const links=[...doc.querySelectorAll('a[href]')].filter(a=>/xlsx|checklist|download/i.test(a.href)).length;
    const probes=[...doc.querySelectorAll('[data-item-id],[data-card-number],[data-card-id],[data-collection-item-id],[data-controller],[data-block-type]')];
    const kinds={};for(const node of probes){const k=node.tagName.toLowerCase()+':'+(node.getAttribute('data-block-type')||node.getAttribute('data-controller')||'item');kinds[k]=(kinds[k]||0)+1;}
    const jsonScripts=[...doc.querySelectorAll('script')].filter(s=>s.type.includes('json')).length;
    const cardMatches=(html.match(/Team Rocket|Cynthia|Ethan|Mewtwo|Garchomp/gi)||[]).length;
    const scriptHits=[...doc.querySelectorAll('script')].filter(s=>/checklist|cardlist|card-list|variants|squarespace/i.test(s.textContent)).length;
    throw Error('La página no expone una tabla compatible ('+entries.length+'/'+expected+' variantes; tablas: '+tables+', filas: '+rows+', scripts: '+scripts+', enlaces de descarga: '+links+', bloques: '+probes.length+', tipos: '+JSON.stringify(kinds).slice(0,180)+', scripts JSON: '+jsonScripts+', scripts relevantes: '+scriptHits+', menciones cartas: '+cardMatches+'). No se guardó nada.');
  }
  if(!entries.length)throw Error('No se encontraron filas de checklist en las tablas públicas');
  return {entries,counts:{master:entries.length,grand:entries.length,optional:0},source:options.url||'',parsedAt:new Date().toISOString(),verified:expected!=null};
}
window.CMPokeCottagePublic={parseHTML,version:'0.1.2'};
})();