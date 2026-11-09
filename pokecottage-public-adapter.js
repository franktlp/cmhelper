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
    throw Error('La página no expone una tabla compatible ('+entries.length+'/'+expected+' variantes; tablas: '+tables+', filas: '+rows+', scripts: '+scripts+', enlaces de descarga: '+links+'). No se guardó nada.');
  }
  if(!entries.length)throw Error('No se encontraron filas de checklist en las tablas públicas');
  return {entries,counts:{master:entries.length,grand:entries.length,optional:0},source:options.url||'',parsedAt:new Date().toISOString(),verified:expected!=null};
}
window.CMPokeCottagePublic={parseHTML,version:'0.1.1'};
})();